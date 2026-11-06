package kr.fieldassistant.prototype

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.provider.Settings
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class NotificationSoundDeviceTest {
    private val manager get()=InstrumentationRegistry.getInstrumentation().targetContext
        .getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    @Test fun newChannelUsesDefaultNotificationSound() {
        val id="sound-test-"+UUID.randomUUID()
        try {
            AssistantNotificationChannels.ensure(manager,id,"Test",NotificationManager.IMPORTANCE_HIGH)
            val channel=manager.getNotificationChannel(id)
            assertNotNull(channel)
            assertEquals(Settings.System.DEFAULT_NOTIFICATION_URI,channel.sound)
            assertEquals(AudioAttributes.USAGE_NOTIFICATION,channel.audioAttributes.usage)
        } finally { manager.deleteNotificationChannel(id) }
    }

    @Test fun existingSilentChannelIsNotOverridden() {
        val id="sound-test-"+UUID.randomUUID()
        try {
            manager.createNotificationChannel(NotificationChannel(id,"Test",NotificationManager.IMPORTANCE_HIGH).apply { setSound(null,null) })
            assertNull(manager.getNotificationChannel(id).sound)
            AssistantNotificationChannels.ensure(manager,id,"Test",NotificationManager.IMPORTANCE_HIGH)
            assertNull(manager.getNotificationChannel(id).sound)
        } finally { manager.deleteNotificationChannel(id) }
    }
}
