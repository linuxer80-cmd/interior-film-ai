package kr.fieldassistant.prototype

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

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
    override fun onMessageReceived(message:RemoteMessage) {
        val target=ChatPushTarget.parse(message.data) ?: return
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
