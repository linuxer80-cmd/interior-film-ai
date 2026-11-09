package kr.fieldassistant.prototype

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import androidx.work.*
import org.json.JSONObject
import kr.fieldassistant.prototype.WhisperModel as Model
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal object BackgroundCalls {
    private const val STATE="assistant_background_state"
    private const val ACTIVE="active_user"
    private const val PERIODIC="assistant_background_periodic"
    private const val IMMEDIATE="assistant_background_immediate"
    private const val WATCH="assistant_background_watch"
    private const val RETRY="assistant_background_retry"
    val lock=Any()
    val running=AtomicBoolean(false)
    val scanning=AtomicBoolean(false)
    private val retryPending=AtomicBoolean(false)
    fun resultPrefs(ctx: Context,uid: String)=ctx.getSharedPreferences("assistant_background_$uid",Context.MODE_PRIVATE)
    fun active(ctx: Context,uid: String,token: String?=null): Boolean {
        val state=ctx.getSharedPreferences(STATE,Context.MODE_PRIVATE)
        return state.getString(ACTIVE,null)==uid && (token==null || state.getString("generation",null)==token)
    }
    private fun generation(ctx: Context)=ctx.getSharedPreferences(STATE,Context.MODE_PRIVATE).getString("generation",null)
    private fun input(uid: String, token: String, watch: Boolean=false)=workDataOf("user" to uid,"generation" to token,"watch" to watch)
    fun activate(ctx: Context,uid: String,tree: Uri) {
        val token=synchronized(lock) {
            val state=ctx.getSharedPreferences(STATE,Context.MODE_PRIVATE)
            val same=state.getString(ACTIVE,null)==uid && state.getString("tree",null)==tree.toString()
            val next=if(same) state.getString("generation",null) ?: UUID.randomUUID().toString() else UUID.randomUUID().toString()
            check(state.edit().putString(ACTIVE,uid).putString("tree",tree.toString()).putString("generation",next).commit());next
        }
        val manager=WorkManager.getInstance(ctx)
        val periodic=PeriodicWorkRequestBuilder<BackgroundCallWorker>(15,TimeUnit.MINUTES).setInputData(input(uid,token)).build()
        manager.enqueueUniquePeriodicWork(PERIODIC,ExistingPeriodicWorkPolicy.UPDATE,periodic)
        armWatcher(ctx,uid,tree,false)
        kick(ctx,uid)
    }
    fun kick(ctx: Context,uid: String) {
        if(!active(ctx,uid)) return
        val token=generation(ctx) ?: return
        WorkManager.getInstance(ctx).enqueueUniqueWork(IMMEDIATE,ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<BackgroundCallWorker>().setInputData(input(uid,token)).build())
    }
    fun retryLater(ctx: Context,uid: String,token: String) {
        if(!active(ctx,uid,token) || !retryPending.compareAndSet(false,true)) return
        try {
            WorkManager.getInstance(ctx).enqueueUniqueWork(RETRY,ExistingWorkPolicy.APPEND_OR_REPLACE,
                OneTimeWorkRequestBuilder<BackgroundCallWorker>()
                    .setInputData(workDataOf("user" to uid,"generation" to token,"retry" to true))
                    .setInitialDelay(20,TimeUnit.SECONDS).build())
        } catch(e: Exception) { retryPending.set(false);throw e }
    }
    fun retryStarted() { retryPending.set(false) }
    fun status(ctx: Context,uid: String,message: String) {
        resultPrefs(ctx,uid).edit().putString("scan_status",message).putLong("last_check_at",System.currentTimeMillis()).apply()
    }
    fun armWatcher(ctx: Context,uid: String,tree: Uri,append: Boolean) {
        if(!active(ctx,uid)) return
        val token=generation(ctx) ?: return
        val constraints=Constraints.Builder().addContentUriTrigger(tree,true)
            .setTriggerContentUpdateDelay(10,TimeUnit.SECONDS).setTriggerContentMaxDelay(30,TimeUnit.SECONDS).build()
        val request=OneTimeWorkRequestBuilder<BackgroundCallWorker>().setInputData(input(uid,token,true)).setConstraints(constraints).build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(WATCH,if(append) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP,request)
    }
    fun stop(ctx: Context) {
        synchronized(lock) { ctx.getSharedPreferences(STATE,Context.MODE_PRIVATE).edit().remove(ACTIVE).remove("generation").remove("tree").commit() }
        retryPending.set(false)
        val manager=WorkManager.getInstance(ctx)
        manager.cancelUniqueWork(PERIODIC);manager.cancelUniqueWork(IMMEDIATE);manager.cancelUniqueWork(WATCH);manager.cancelUniqueWork(RETRY)
    }
    fun resetResults(ctx: Context,uid: String) { synchronized(lock) { resultPrefs(ctx,uid).edit().clear().commit() } }
    fun key(id: String): String = MessageDigest.getInstance("SHA-256").digest(id.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}

class BackgroundCallWorker(context: Context,params: WorkerParameters): Worker(context,params) {
    override fun doWork(): Result {
        val ctx=applicationContext;val uid=inputData.getString("user") ?: return Result.success()
        val token=inputData.getString("generation") ?: return Result.success()
        if(!BackgroundCalls.active(ctx,uid,token)) return Result.success()
        if(inputData.getBoolean("retry",false)) BackgroundCalls.retryStarted()
        val userPrefs=ctx.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE)
        val tree=userPrefs.getString("folder",null)?.let(Uri::parse) ?: return Result.success()
        if(!BackgroundCalls.scanning.compareAndSet(false,true)) {
            if(BackgroundCalls.active(ctx,uid,token)) BackgroundCalls.retryLater(ctx,uid,token)
            if(inputData.getBoolean("watch",false) && BackgroundCalls.active(ctx,uid,token)) BackgroundCalls.armWatcher(ctx,uid,tree,true)
            return Result.success()
        }
        try {
            BackgroundCalls.status(ctx,uid,"녹음 폴더를 확인하고 있습니다.")
            // Fetch metadata once rather than issuing several provider queries per recording.
            data class Recording(val uri: Uri,val name: String,val size: Long,val modified: Long)
            val files=mutableListOf<Recording>()
            val children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree))
            val columns=arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_LAST_MODIFIED,DocumentsContract.Document.COLUMN_MIME_TYPE)
            ctx.contentResolver.query(children,columns,null,null,null)?.use { cursor ->
                while(cursor.moveToNext()) {
                    if(isStopped || !BackgroundCalls.active(ctx,uid,token)) return Result.success()
                    val name=cursor.getString(1).orEmpty()
                    if(cursor.getString(4)==DocumentsContract.Document.MIME_TYPE_DIR) continue
                    if(listOf(".m4a",".mp3",".wav",".ogg",".flac").none(name.lowercase(Locale.ROOT)::endsWith)) continue
                    files.add(Recording(DocumentsContract.buildDocumentUriUsingTree(tree,cursor.getString(0)),name,cursor.getLong(2),cursor.getLong(3)))
                }
            } ?: throw SecurityException("폴더를 열 수 없습니다")
            files.sortBy { it.modified }
            val existing=userPrefs.getStringSet("seen",emptySet())!!.toSet()
            val background=BackgroundCalls.resultPrefs(ctx,uid)
            val processed=background.getStringSet("processed",emptySet())!!.toMutableSet()
            var count=0;var needsRetry=false
            run {
                for(file in files) {
                    if(isStopped || !BackgroundCalls.active(ctx,uid,token)) break
                    val id=file.uri.toString();if(id in existing || id in processed || file.size<=0) continue
                    val key=BackgroundCalls.key(id);val now=System.currentTimeMillis();val size=file.size;val modified=file.modified
                    val oldSize=background.getLong("size_$key",-1);val first=background.getLong("time_$key",0)
                    if((modified>0 && now-modified in 0..14999) || oldSize!=size || first==0L || now-first<15000) {
                        background.edit().putLong("size_$key",size).putLong("time_$key",if(oldSize==size && first>0) first else now).apply()
                        needsRetry=true;continue
                    }
                    if(count>=3) { needsRetry=true;break }
                    val record=JSONObject().put("id",id).put("name",file.name)
                    var candidate=false
                    var failed=false
                    if(!BackgroundCalls.running.compareAndSet(false,true)) { needsRetry=true;break }
                    try {
                        count++
                        if(BackgroundCalls.active(ctx,uid,token)) BackgroundCalls.status(ctx,uid,"새 녹음을 휴대폰에서 분석하고 있습니다.")
                        try {
                            val manager=ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                            AssistantNotificationChannels.ensure(manager,"assistant_processing","음성 분석 진행",NotificationManager.IMPORTANCE_LOW)
                            val notification=Notification.Builder(ctx,"assistant_processing").setSmallIcon(android.R.drawable.ic_btn_speak_now)
                                .setContentTitle("통화 녹음 분석 중").setContentText("휴대폰에서 녹음 내용을 확인하고 있습니다.").setOngoing(true).build()
                            val type=if(Build.VERSION.SDK_INT>=35) android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING else android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                            setForegroundAsync(ForegroundInfo(3189,notification,type)).get()
                        } catch(_:Exception) { BackgroundCalls.status(ctx,uid,"백그라운드 분석이 제한될 수 있습니다. 앱을 열어 확인해 주세요.") }
                        val result=Model(OfflineModel.ensure(ctx) { isStopped || !BackgroundCalls.active(ctx,uid,token) }.absolutePath).use { model ->
                            OfflineAudio.transcribe(ctx,file.uri,model) { isStopped || !BackgroundCalls.active(ctx,uid,token) }
                        }
                        if(result.text.isBlank()) throw IllegalStateException("음성을 읽지 못했습니다.")
                        candidate=InquiryMatcher.likely(result.text)
                        val label=if(candidate) "견적 문의 가능성 있음" else "견적 문의 가능성 확인 필요"
                        record.put("status","확인 필요").put("transcript",result.text)
                            .put("summary","$label\n휴대폰에서 음성을 분석했습니다. 내용을 확인해 주세요."+(if(result.truncated) "\n긴 통화는 앞 15분만 확인했습니다." else ""))
                            .put("offline_candidate",candidate).put("offline_truncated",result.truncated)
                    } catch(e: InterruptedException) { break
                    } catch(_: Exception) {
                        failed=true
                        record.put("status","분석 실패").put("summary","녹음 파일과 휴대폰 저장 공간을 확인한 뒤 앱에서 다시 시도해 주세요.")
                    }
                    finally { BackgroundCalls.running.set(false) }
                    synchronized(BackgroundCalls.lock) {
                        if(isStopped || !BackgroundCalls.active(ctx,uid,token)) return@synchronized
                        val attempts=if(failed) background.getInt("attempts_$key",0)+1 else 0
                        if(CallRetryPolicy.shouldRetry(failed,attempts)) needsRetry=true else processed.add(id)
                        val edit=background.edit().putInt("attempts_$key",attempts).putStringSet("processed",processed.toSet())
                        // Publishing a record makes the foreground mark it seen. Publish only after retry is complete.
                        if(!CallRetryPolicy.shouldRetry(failed,attempts)) edit.putString("record_$key",record.toString()).remove("size_$key").remove("time_$key")
                        check(edit.commit())
                        if(candidate) notifyCandidate(ctx,uid,id)
                    }
                }
            }
            if(BackgroundCalls.active(ctx,uid,token) && !isStopped) {
                val summary=when {
                    needsRetry -> "확인할 녹음이 남아 있어 잠시 후 다시 확인합니다."
                    count>0 -> "새 녹음 분석을 마쳤습니다. 아래 비서함을 확인해 주세요."
                    else -> "연결된 폴더에 새 녹음이 없습니다."
                }
                BackgroundCalls.status(ctx,uid,summary)
                if(needsRetry) BackgroundCalls.retryLater(ctx,uid,token)
            }
            return Result.success()
        } catch(_: SecurityException) {
            if(BackgroundCalls.active(ctx,uid,token)) BackgroundCalls.status(ctx,uid,"녹음 폴더에 접근할 수 없습니다. 폴더를 다시 연결해 주세요.")
            return Result.success()
        } catch(_: Exception) {
            if(BackgroundCalls.active(ctx,uid,token)) BackgroundCalls.status(ctx,uid,"녹음 폴더 확인에 실패했습니다. 잠시 후 다시 확인합니다.")
            return Result.retry()
        }
        finally {
            BackgroundCalls.scanning.set(false)
            if(inputData.getBoolean("watch",false) && BackgroundCalls.active(ctx,uid,token)) BackgroundCalls.armWatcher(ctx,uid,tree,true)
        }
    }
    private fun notifyCandidate(ctx: Context,uid: String,id: String) { CallNotifications.post(ctx,uid,id) }

}
