package kr.fieldassistant.prototype

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.work.*
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

data class AssignedDay(val id: String,val name: String,val address: String,val date: String) {
    val key get() = "$id|$date"
}
internal object ScheduleDates {
    private val zone=ZoneId.of("Asia/Seoul")
    fun today(): String=LocalDate.now(zone).toString()
    private fun parse(s: String): LocalDate?=try { LocalDate.parse(s.take(10)) } catch(_: Exception) { null }
    fun fromSites(sites: JSONArray,from: String,to: String): List<AssignedDay> {
        val start=parse(from) ?: return emptyList();val end=parse(to) ?: return emptyList()
        if(end<start || Duration.between(start.atStartOfDay(),end.atStartOfDay()).toDays()>90) return emptyList()
        val items=linkedMapOf<String,AssignedDay>()
        for(i in 0 until sites.length()) {
            val s=sites.optJSONObject(i) ?: continue
            if(s.optString("status") !in listOf("scheduled","in_progress")) continue
            val id=s.optString("site_id").ifBlank { s.optString("id") }
            if(!Regex("^[0-9a-fA-F-]{36}$").matches(id)) continue
            val company=s.optString("company_id")
            if(!Regex("^[0-9a-fA-F-]{36}$").matches(company)) continue
            val address=listOf(s.optString("address",""),s.optString("address_detail","")).filter { it.isNotBlank() && it!="null" }.joinToString(" ")
            val name=s.optString("site_name","현장").ifBlank { "현장" }
            val assigned=s.optJSONArray("assigned_dates");val work=s.optJSONArray("work_dates")
            val days=mutableSetOf<LocalDate>()
            if(assigned!=null && assigned.length()>0) {
                for(j in 0 until assigned.length()) parse(assigned.optJSONObject(j)?.optString("work_date").orEmpty())?.let(days::add)
            } else if(work!=null) {
                for(j in 0 until work.length()) parse(work.optString(j))?.let(days::add)
            } else {
                val first=parse(s.optString("schedule_start"));val last=parse(s.optString("schedule_end")) ?: first
                if(first!=null && last!=null) {
                    var day=maxOf(first,start);val limit=minOf(last,end)
                    while(day<=limit) { days.add(day);day=day.plusDays(1) }
                }
            }
            for(day in days.filter { it>=start && it<=end }) {
                val item=AssignedDay("$company/$id",name,address,day.toString());items[item.key]=item
            }
        }
        return items.values.sortedWith(compareBy({it.date},{it.name},{it.id}))
    }
}
internal object ScheduleLogic {
    fun additions(baseline: Boolean, previous: Set<String>, current: Set<String>): Set<String> =
        if(baseline) current - previous else emptySet()
    fun shouldRemind(hour: Int, alreadySent: Boolean, hasAssignments: Boolean): Boolean =
        hour in 7..11 && !alreadySent && hasAssignments
}
internal object ScheduleJobs {
    private const val STATE="assistant_schedule_state"
    private const val PERIODIC="assistant_schedule_periodic"
    private const val MORNING="assistant_schedule_morning"
    private const val NOW="assistant_schedule_now"
    val lock=Any();val running=AtomicBoolean(false)
    private fun prefs(c:Context)=c.getSharedPreferences(STATE,Context.MODE_PRIVATE)
    fun active(c:Context,u:String,t:String)=prefs(c).getString("user",null)==u && prefs(c).getString("generation",null)==t
    private fun data(u:String,t:String,morning:Boolean=false)=workDataOf("user" to u,"generation" to t,"morning" to morning)
    fun activate(c:Context,u:String) {
        val token=synchronized(lock) {
            val p=prefs(c);val existing=if(p.getString("user",null)==u) p.getString("generation",null) else null
            val t=existing ?: UUID.randomUUID().toString()
            check(p.edit().putString("user",u).putString("generation",t).commit());t
        }
        val wm=WorkManager.getInstance(c)
        val network=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        wm.enqueueUniquePeriodicWork(PERIODIC,ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<ScheduleWorker>(60,TimeUnit.MINUTES).setConstraints(network).setInputData(data(u,token)).build())
        armMorning(c,u,token,false)
        wm.enqueueUniqueWork(NOW,ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<ScheduleWorker>()
            .setConstraints(network).setInputData(data(u,token)).build())
    }
    fun armMorning(c:Context,u:String,t:String,append:Boolean) {
        if(!active(c,u,t)) return
        val now=ZonedDateTime.now(ZoneId.of("Asia/Seoul"));var next=now.toLocalDate().atTime(7,0).atZone(now.zone)
        if(!next.isAfter(now)) next=next.plusDays(1)
        val delay=Duration.between(now,next).toMillis().coerceAtLeast(1)
        val req=OneTimeWorkRequestBuilder<ScheduleWorker>().setInitialDelay(delay,TimeUnit.MILLISECONDS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setInputData(data(u,t,true)).build()
        WorkManager.getInstance(c).enqueueUniqueWork(MORNING,if(append) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP,req)
    }
    fun stop(c:Context) {
        synchronized(lock) { prefs(c).edit().clear().commit() }
        val wm=WorkManager.getInstance(c);wm.cancelUniqueWork(PERIODIC);wm.cancelUniqueWork(MORNING);wm.cancelUniqueWork(NOW)
    }
    fun results(c:Context,u:String)=c.getSharedPreferences("assistant_schedule_$u",Context.MODE_PRIVATE)
}
class ScheduleWorker(c:Context,p:WorkerParameters):CoroutineWorker(c,p) {
    override suspend fun doWork(): Result {
        val c=applicationContext;val uid=inputData.getString("user") ?: return Result.success()
        val token=inputData.getString("generation") ?: return Result.success()
        val morningJob=inputData.getBoolean("morning",false)
        if(!ScheduleJobs.active(c,uid,token)) return Result.success()
        if(!ScheduleJobs.running.compareAndSet(false,true)) {
            if(morningJob) ScheduleJobs.armMorning(c,uid,token,true)
            return Result.success()
        }
        var completed=false
        try {
            val sites=AccountAuth.shared(c).assignedSites(uid)
            val today=LocalDate.now(ZoneId.of("Asia/Seoul"))
            val days=ScheduleDates.fromSites(sites,today.toString(),today.plusDays(90).toString())
            synchronized(ScheduleJobs.lock) {
                if(isStopped || !ScheduleJobs.active(c,uid,token)) return@synchronized
                val p=ScheduleJobs.results(c,uid)
                val baseline=p.getBoolean("baseline",false)
                val previous=p.getStringSet("days",emptySet())?.toSet() ?: emptySet()
                val newKeys=ScheduleLogic.additions(baseline,previous,days.map { it.key }.toSet())
                val newItems=days.filter { it.key in newKeys }
                val now=ZonedDateTime.now(ZoneId.of("Asia/Seoul"))
                val todayItems=days.filter { it.date==today.toString() }
                val wasSent=p.getString("morning_date","")==today.toString()
                val sent=if(ScheduleLogic.shouldRemind(now.hour,wasSent,todayItems.isNotEmpty())) send(c,uid,today.toString(),"morning") else false
                // One current-day appointment needs only the morning prompt.
                val separate=newItems.filter { !sent || it.date!=today.toString() }
                if(separate.isNotEmpty()) send(c,uid,separate.first().date,"new")
                val e=p.edit().putBoolean("baseline",true).putStringSet("days",days.map { it.key }.toSet())
                if(sent) e.putString("morning_date",today.toString())
                check(e.commit())
            }
            completed=true;return Result.success()
        } catch(e:CancellationException) { throw e }
          catch(_:Exception) { return Result.retry() }
        finally {
            ScheduleJobs.running.set(false)
            if(completed && morningJob && ScheduleJobs.active(c,uid,token)) ScheduleJobs.armMorning(c,uid,token,true)
        }
    }
    private fun send(c:Context,uid:String,date:String,kind:String):Boolean {
        val manager=c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("assistant_results","비서 알림",NotificationManager.IMPORTANCE_DEFAULT))
        if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return false
        if(!manager.areNotificationsEnabled() || manager.getNotificationChannel("assistant_results")?.importance==NotificationManager.IMPORTANCE_NONE) return false
        val code=("schedule:$uid:$date:$kind".hashCode() and Int.MAX_VALUE)
        val intent=Intent(c,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("schedule_user",uid).putExtra("schedule_date",date)
        val pending=PendingIntent.getActivity(c,code,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title=if(kind=="morning") "오늘 시공 일정이 있어요" else "새 시공 일정이 등록됐어요"
        val text=if(kind=="morning") "일정을 확인하고 현장까지 길 안내를 받을까요?" else "배정된 시공 일정을 확인해 주세요."
        return try { manager.notify(code,Notification.Builder(c,"assistant_results").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(text).setContentIntent(pending).setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).build());true }
        catch(_:SecurityException) { false }
    }
}
