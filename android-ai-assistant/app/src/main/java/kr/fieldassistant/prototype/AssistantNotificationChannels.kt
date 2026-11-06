package kr.fieldassistant.prototype

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.provider.Settings

/** Configure sound only when creating a channel; existing user choices remain intact. */
internal object AssistantNotificationChannels {
    fun ensure(manager:NotificationManager,id:String,name:String,importance:Int) {
        if(manager.getNotificationChannel(id)!=null) return
        val audio=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val channel=NotificationChannel(id,name,importance).apply {
            setSound(Settings.System.DEFAULT_NOTIFICATION_URI,audio)
        }
        manager.createNotificationChannel(channel)
    }
}
