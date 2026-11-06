package kr.fieldassistant.prototype

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class NotificationInboxDeviceTest {
    @Test fun displaysOnlyCurrentAccountsActiveNotifications() {
        val c=InstrumentationRegistry.getInstrumentation().targetContext
        if(android.os.Build.VERSION.SDK_INT>=33) InstrumentationRegistry.getInstrumentation().uiAutomation.grantRuntimePermission(c.packageName,android.Manifest.permission.POST_NOTIFICATIONS)
        val m=c.getSystemService(NotificationManager::class.java)
        m.createNotificationChannel(NotificationChannel("inbox_test","Inbox test",NotificationManager.IMPORTANCE_DEFAULT))
        val own="inbox-owner-test";val other="inbox-other-test"
        try {
            m.notify("inbox-test-own",901,Notification.Builder(c,"inbox_test").setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("견적 문의").setContentText("현장 등록").addExtras(NotificationInbox.owner(own)).build())
            m.notify("inbox-test-other",902,Notification.Builder(c,"inbox_test").setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("다른 계정").addExtras(NotificationInbox.owner(other)).build())
            var mine=NotificationInbox.list(c,own)
            var theirs=NotificationInbox.list(c,other)
            repeat(40) {
                if(mine.isEmpty() || theirs.isEmpty()) { Thread.sleep(100);mine=NotificationInbox.list(c,own);theirs=NotificationInbox.list(c,other) }
            }
            assertEquals("own notification missing; active="+m.activeNotifications.size,1,mine.size)
            assertEquals("견적 문의",mine[0].notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
            assertEquals(1,theirs.size)
            assertTrue(NotificationInbox.list(c,"").isEmpty())
        } finally {
            m.cancel("inbox-test-own",901);m.cancel("inbox-test-other",902);m.deleteNotificationChannel("inbox_test")
        }
    }
}
