package kr.fieldassistant.prototype

import android.content.ComponentName
import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class CallNotificationDeviceTest {
    private val ctx get()=InstrumentationRegistry.getInstrumentation().targetContext
    private fun runCase(block:(Context,String,String)->Unit) {
        val c=ctx;val uid="test-"+UUID.randomUUID();val id="content://test/"+UUID.randomUUID()
        val state=c.getSharedPreferences("assistant_background_state",Context.MODE_PRIVATE);val old=state.getString("active_user",null)
        try {
            check(state.edit().putString("active_user",uid).commit())
            block(c,uid,id)
        } finally {
            c.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE).edit().clear().commit()
            BackgroundCalls.resultPrefs(c,uid).edit().clear().commit()
            val edit=state.edit();if(old==null) edit.remove("active_user") else edit.putString("active_user",old);edit.commit()
        }
    }
    @Test fun notificationHasSeparateActionsAndReceiverIsPrivate() = runCase { c,uid,id ->
        val n=CallNotifications.build(c,uid,id)
        assertEquals(2,n.actions.size);assertEquals("예",n.actions[0].title.toString());assertEquals("아니요",n.actions[1].title.toString())
        assertNotEquals(n.actions[0].actionIntent,n.actions[1].actionIntent)
        @Suppress("DEPRECATION") val info=c.packageManager.getReceiverInfo(ComponentName(c,CallNotificationDeclineReceiver::class.java),0)
        assertFalse(info.exported)
    }
    @Test fun declineActionPersistsChoiceForForegroundRecord() = runCase { c,uid,id ->
        val p=c.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE)
        val row=JSONObject().put("id",id).put("status","확인 필요").put("transcript","견적 문의")
        check(p.edit().putString("records",JSONArray().put(row).toString()).commit())
        val latch=CountDownLatch(1)
        val listener=android.content.SharedPreferences.OnSharedPreferenceChangeListener { _,key -> if(key==CallNotifications.declinedKey(id)) latch.countDown() }
        p.registerOnSharedPreferenceChangeListener(listener)
        try { CallNotifications.build(c,uid,id).actions[1].actionIntent.send();assertTrue(latch.await(5,TimeUnit.SECONDS)) }
        finally { p.unregisterOnSharedPreferenceChangeListener(listener) }
        assertTrue(p.getBoolean(CallNotifications.declinedKey(id),false))
        assertFalse(p.getBoolean(CallNotifications.declinedKey("other"),false))
    }
    @Test fun declineWorksBeforeBackgroundRecordIsMerged() = runCase { c,uid,id ->
        val row=JSONObject().put("id",id).put("status","확인 필요").put("transcript","시트지 문의")
        check(BackgroundCalls.resultPrefs(c,uid).edit().putString("record_"+BackgroundCalls.key(id),row.toString()).commit())
        assertTrue(CallNotifications.decline(c,uid,id))
        assertTrue(c.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE).getBoolean(CallNotifications.declinedKey(id),false))
    }
    @Test fun wrongUserAndAlreadySubmittedRecordsCannotBeDeclined() = runCase { c,uid,id ->
        val p=c.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE)
        val row=JSONObject().put("id",id).put("status","확인 필요").put("site_id","saved-site")
        check(p.edit().putString("records",JSONArray().put(row).toString()).commit())
        assertFalse(CallNotifications.decline(c,"another-user",id))
        assertFalse(CallNotifications.decline(c,uid,id))
        row.remove("site_id");row.put("registration",JSONObject().put("request_id","sent"))
        check(p.edit().putString("records",JSONArray().put(row).toString()).commit())
        assertFalse(CallNotifications.decline(c,uid,id));assertFalse(p.getBoolean(CallNotifications.declinedKey(id),false))
    }
}
