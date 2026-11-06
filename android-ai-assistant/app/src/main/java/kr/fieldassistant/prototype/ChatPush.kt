package kr.fieldassistant.prototype

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.google.firebase.messaging.FirebaseMessaging
import com.google.android.gms.tasks.Tasks
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Only opaque identifiers are accepted. Conversation text is never in the notification. */
internal data class ChatPushTarget(val kind:String,val user:String,val company:String,val target:String,val message:String,val date:String) {
    companion object {
        private val uuid=Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        fun parse(data:Map<String,String>):ChatPushTarget? {
            val kind=data["kind"] ?: return null
            val user=data["recipient_id"] ?: return null;val company=data["company_id"] ?: return null
            val target=data["target_id"] ?: return null;val message=data["message_id"] ?: return null
            val date=data["date"].orEmpty()
            if(kind !in listOf("customer","team") || listOf(user,company,target,message).any { !uuid.matches(it) }) return null
            if(kind=="team" && !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(date)) return null
            return ChatPushTarget(kind,user,company,target,message,date)
        }
        fun fromIntent(intent:Intent?):ChatPushTarget? = parse(listOf("kind","recipient_id","company_id","target_id","message_id","date")
            .mapNotNull { key -> intent?.getStringExtra("chat_push_$key")?.let { key to it } }.toMap())
    }
    fun addTo(intent:Intent) {
        mapOf("kind" to kind,"recipient_id" to user,"company_id" to company,"target_id" to target,"message_id" to message,"date" to date)
            .forEach { (key,value) -> intent.putExtra("chat_push_$key",value) }
    }
}

class ChatPushService:FirebaseMessagingService() {
    override fun onNewToken(token:String) { ChatPushRegistration.enqueue(applicationContext) }
    override fun onMessageReceived(message:RemoteMessage) {
        val target=ChatPushTarget.parse(message.data) ?: return
        if(ChatPushRegistration.activeUser(applicationContext)!=target.user) return
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return
        val manager=getSystemService(NotificationManager::class.java) ?: return
        val channel="chat_messages"
        manager.createNotificationChannel(NotificationChannel(channel,"채팅 메시지",NotificationManager.IMPORTANCE_HIGH))
        val intent=Intent(this,MainActivity::class.java).apply {
            flags=Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            data=Uri.parse("fieldassistant://chat-notification/${target.message}")
            target.addTo(this)
        }
        val pending=PendingIntent.getActivity(this,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification=Notification.Builder(this,channel).setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(if(target.kind=="customer") "고객 메시지" else "팀원 메시지")
            .setContentText("새 메시지가 있습니다. 앱에서 확인해 주세요.")
            .setContentIntent(pending).setAutoCancel(true).setCategory(Notification.CATEGORY_MESSAGE).build()
        manager.notify("chat-${target.message}",0,notification)
    }
}

internal object ChatPushRegistration {
    private const val PREFS="chat_push_registration"
    private const val WORK="register_chat_push"
    val mutex=Mutex()
    private fun prefs(c:Context)=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
    fun activeUser(c:Context)=prefs(c).getString("user",null)
    fun device(c:Context):String {
        val p=prefs(c);val existing=p.getString("device",null)
        if(existing!=null) return existing
        val value=UUID.randomUUID().toString();check(p.edit().putString("device",value).commit());return value
    }
    fun activate(c:Context,user:String) {
        check(prefs(c).edit().putString("user",user).commit());device(c);enqueue(c,replace=true)
    }
    fun enqueue(c:Context,replace:Boolean=false) {
        val user=activeUser(c) ?: return
        val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val work=OneTimeWorkRequestBuilder<ChatPushWorker>().setInputData(workDataOf("user" to user)).setConstraints(constraints).build()
        WorkManager.getInstance(c).enqueueUniqueWork(WORK,if(replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP,work)
    }
    fun deactivate(c:Context):String {
        prefs(c).edit().remove("user").commit()
        WorkManager.getInstance(c).cancelUniqueWork(WORK)
        val manager=c.getSystemService(NotificationManager::class.java)
        manager?.activeNotifications?.filter { it.notification.channelId=="chat_messages" }?.forEach { manager.cancel(it.tag,it.id) }
        FirebaseMessaging.getInstance().isAutoInitEnabled=false
        return device(c)
    }
}

class ChatPushWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params) {
    override suspend fun doWork():Result {
        val user=inputData.getString("user") ?: return Result.failure()
        return try {
            ChatPushRegistration.mutex.withLock {
                if(ChatPushRegistration.activeUser(applicationContext)!=user) return@withLock Result.success()
                val auth=AccountAuth.shared(applicationContext)
                val account=auth.restore() ?: return@withLock Result.success()
                if(account.userId!=user) return@withLock Result.success()
                val token=withContext(Dispatchers.IO) {
                    FirebaseMessaging.getInstance().isAutoInitEnabled=true
                    Tasks.await(FirebaseMessaging.getInstance().token,15,TimeUnit.SECONDS)
                }
                if(ChatPushRegistration.activeUser(applicationContext)!=user) return@withLock Result.success()
                auth.updateChatPush(user,ChatPushRegistration.device(applicationContext),token)
                Result.success()
            }
        } catch(e:kotlinx.coroutines.CancellationException) { throw e }
          catch(_:Exception) { Result.retry() }
    }
}
