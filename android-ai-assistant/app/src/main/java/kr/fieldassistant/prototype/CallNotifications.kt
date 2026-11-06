package kr.fieldassistant.prototype

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject

/** Notification actions never include call content or submit a site in the background. */
internal object CallNotifications {
    const val DECLINED_PREFIX="notification_declined_"
    private const val DECLINE="kr.fieldassistant.prototype.CALL_DECLINE"
    fun declinedKey(id:String)=DECLINED_PREFIX+BackgroundCalls.key(id)
    private fun identity(uid:String,id:String,action:String)=Uri.Builder().scheme("assistant-call").authority("notification")
        .appendPath(BackgroundCalls.key(uid+"\n"+id)).appendPath(action).build()
    fun build(ctx:Context,uid:String,id:String):Notification {
        val yes=Intent(ctx,MainActivity::class.java).setAction("kr.fieldassistant.prototype.CALL_REVIEW")
            .setData(identity(uid,id,"yes")).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("assistant_record",id).putExtra("assistant_user",uid).putExtra("assistant_decision","yes")
        val no=Intent(ctx,CallNotificationDeclineReceiver::class.java).setAction(DECLINE).setData(identity(uid,id,"no"))
            .putExtra("assistant_record",id).putExtra("assistant_user",uid)
        val review=PendingIntent.getActivity(ctx,0,yes,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val decline=PendingIntent.getBroadcast(ctx,0,no,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(ctx,"assistant_results").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("견적 문의로 보이는 전화가 왔습니다")
            .setContentText("현장에 등록할까요?")
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(review).setAutoCancel(true)
            .addAction(Notification.Action.Builder(0,"예",review).build())
            .addAction(Notification.Action.Builder(0,"아니요",decline).build()).build()
    }
    fun post(ctx:Context,uid:String,id:String) {
        if(!BackgroundCalls.active(ctx,uid) || ctx.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE).getBoolean(declinedKey(id),false)) return
        val manager=ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        AssistantNotificationChannels.ensure(manager,"assistant_results","통화 분석 결과",NotificationManager.IMPORTANCE_DEFAULT)
        if(Build.VERSION.SDK_INT>=33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return
        if(!manager.areNotificationsEnabled() || manager.getNotificationChannel("assistant_results")?.importance==NotificationManager.IMPORTANCE_NONE) return
        try { manager.notify(id.hashCode() and Int.MAX_VALUE,build(ctx,uid,id)) } catch(_:SecurityException) { }
    }
    fun decline(ctx:Context,uid:String,id:String):Boolean = synchronized(BackgroundCalls.lock) {
        if(uid.isBlank() || id.isBlank() || !BackgroundCalls.active(ctx,uid)) return@synchronized false
        val prefs=ctx.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE)
        val records=try { JSONArray(prefs.getString("records","[]")) } catch(_:Exception) { return@synchronized false }
        val current=(0 until records.length()).mapNotNull { records.optJSONObject(it) }.firstOrNull { it.optString("id")==id }
        val background=BackgroundCalls.resultPrefs(ctx,uid).getString("record_"+BackgroundCalls.key(id),null)
        val item=current ?: background?.let { try { JSONObject(it) } catch(_:Exception) { null } } ?: return@synchronized false
        if(item.optString("status")!="확인 필요" || item.optString("site_id").isNotBlank() || item.optJSONObject("registration")!=null) return@synchronized false
        val messages=item.optJSONArray("chat_messages") ?: JSONArray()
        val replies=(0 until messages.length()).mapNotNull { messages.optJSONObject(it) }.filter { it.optBoolean("user") }.map { it.optString("body") }
        if(ConsultationChat.disposition(item.optString("chat_disposition"),replies)!="active") return@synchronized false
        prefs.edit().putBoolean(declinedKey(id),true).commit()
    }
    fun isDeclineIntent(intent:Intent?)=intent?.action==DECLINE
}

/** The explicit, non-exported receiver records only the negative choice. */
class CallNotificationDeclineReceiver:BroadcastReceiver() {
    override fun onReceive(context:Context,intent:Intent?) {
        if(!CallNotifications.isDeclineIntent(intent)) return
        val uid=intent?.getStringExtra("assistant_user") ?: return
        val id=intent.getStringExtra("assistant_record") ?: return
        if(CallNotifications.decline(context,uid,id)) {
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(id.hashCode() and Int.MAX_VALUE)
        } else Toast.makeText(context,"이 통화의 등록 상태를 앱에서 확인해 주세요.",Toast.LENGTH_LONG).show()
    }
}
