package kr.fieldassistant.prototype

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.provider.DocumentsContract
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class SchedulingTest {
    @Test fun recordingChangedDuringRetryIsEventuallyAnalyzed() {
        val c=ApplicationProvider.getApplicationContext<Context>()
        val uid="scheduler-test"
        val folder=DocumentsContract.buildTreeDocumentUri(c.packageName+".fake-recordings","root")
        val user=c.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE)
        val result=BackgroundCalls.resultPrefs(c,uid)
        val dir=File(c.filesDir,"fake-recordings").apply { mkdirs() }
        val input=File(dir,"fixture.m4a");input.delete()
        BackgroundCalls.stop(c)
        user.edit().clear().putString("folder",folder.toString()).putStringSet("seen",emptySet()).commit()
        result.edit().clear().commit()
        if(Build.VERSION.SDK_INT>=33) InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("pm grant ${c.packageName} ${Manifest.permission.POST_NOTIFICATIONS}").close()
        val nm=c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager;nm.cancelAll()
        BackgroundCalls.activate(c,uid,folder)
        Thread.sleep(5000)
        c.assets.open("fixture.m4a").use { src -> input.outputStream().use { src.copyTo(it) } }
        val file=DocumentFile.fromTreeUri(c,folder)!!.listFiles().single()
        val key=BackgroundCalls.key(file.uri.toString())
        BackgroundCalls.kick(c,uid)
        fun await(label:String,timeout:Long,condition:()->Boolean) {
            val until=SystemClock.elapsedRealtime()+timeout
            while(SystemClock.elapsedRealtime()<until) { if(condition()) return;Thread.sleep(500) }
            fail("Timed out: $label; status="+result.getString("scan_status", ""))
        }
        await("first scan",45000) { result.getLong("time_$key",0)>0 }
        val firstSize=result.getLong("size_$key",0)
        input.appendBytes(byteArrayOf(0,0,0,8,102,114,101,101))
        assertTrue(input.length()>firstSize)
        await("retry observes changed file",60000) { result.getLong("size_$key",0)>firstSize }
        Log.i("AssistantTest","First scheduled retry noticed file change; waiting for next retry")
        await("second retry analyzes recording",150000) { result.getString("record_$key",null)!=null }
        val record=JSONObject(result.getString("record_$key",null)!!)
        Log.i("AssistantTest","STATUS="+record.optString("status")+" CANDIDATE="+record.optBoolean("offline_candidate")+" NOTIFICATIONS="+nm.activeNotifications.size)
        assertEquals("확인 필요",record.optString("status"))
        assertTrue(record.optString("transcript").isNotBlank())
        assertTrue(record.optBoolean("offline_candidate"))
        assertEquals(1,nm.activeNotifications.size)
        BackgroundCalls.stop(c)
    }
}
