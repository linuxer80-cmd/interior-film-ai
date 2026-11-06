package kr.fieldassistant.prototype

import android.app.AlertDialog
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.os.Bundle
import android.service.notification.StatusBarNotification
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** The list contains only notifications owned by the signed-in account and still in Android's shade. */
internal object NotificationInbox {
    private const val OWNER="kr.fieldassistant.notification_owner"
    fun owner(user:String)=Bundle().apply { putString(OWNER,user) }
    fun list(context:Context,user:String):List<StatusBarNotification> {
        if(user.isBlank()) return emptyList()
        val manager=context.getSystemService(NotificationManager::class.java) ?: return emptyList()
        return manager.activeNotifications.filter {
            it.notification.extras.getString(OWNER)==user &&
                it.notification.flags and Notification.FLAG_GROUP_SUMMARY==0
        }.sortedByDescending { it.postTime }
    }
    fun show(context:Context,user:String) {
        val notifications=list(context,user)
        if(notifications.isEmpty()) {
            AlertDialog.Builder(context).setTitle("알림 확인")
                .setMessage("현재 앱에 표시할 알림이 없습니다. 이전 버전의 알림은 화면 위에서 아래로 내려 확인해 주세요. 이미 지운 알림은 여기에 표시되지 않습니다.")
                .setPositiveButton("확인",null).show()
            return
        }
        val format=SimpleDateFormat("MM/dd HH:mm",Locale.KOREA)
        val labels=notifications.map {
            val extras=it.notification.extras
            val title=extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.take(120).orEmpty().ifBlank { "알림" }
            val body=extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.take(500).orEmpty()
            listOf(title,body,format.format(Date(it.postTime))).filter(String::isNotBlank).joinToString("\n")
        }.toTypedArray()
        AlertDialog.Builder(context).setTitle("휴대폰에 남아 있는 알림")
            .setItems(labels) { _,i ->
                val item=notifications[i]
                try {
                    val action=item.notification.contentIntent
                    if(action==null) {
                        AlertDialog.Builder(context).setMessage("화면 위에서 아래로 내려 이 알림을 확인해 주세요.").setPositiveButton("확인",null).show()
                    } else {
                        action.send()
                        if(item.notification.flags and Notification.FLAG_AUTO_CANCEL!=0)
                            context.getSystemService(NotificationManager::class.java)?.cancel(item.tag,item.id)
                    }
                } catch(_:android.app.PendingIntent.CanceledException) {
                    AlertDialog.Builder(context).setMessage("이 알림을 열 수 없습니다. 화면 위에서 아래로 내려 확인해 주세요.").setPositiveButton("확인",null).show()
                }
            }.setNegativeButton("닫기",null).show()
    }
}
