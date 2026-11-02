package kr.fieldassistant.prototype

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.provider.DocumentsContract
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.ListenableWorker
import androidx.work.TestWorkerBuilder
import androidx.work.workDataOf
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.Executors

@RunWith(AndroidJUnit4::class)
class IncomingRecordingTest {
    @Test fun syntheticKoreanInquiryIsDetectedAndNotifiedOnce() {
        val c=ApplicationProvider.getApplicationContext<Context>()
        val uid="test-user";val token="test-generation"
        val folder=DocumentsContract.buildTreeDocumentUri(c.packageName+".fake-recordings","root")
        val user=c.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE)
        val state=c.getSharedPreferences("assistant_background_state",Context.MODE_PRIVATE)
        val result=BackgroundCalls.resultPrefs(c,uid)
        val dir=File(c.filesDir,"fake-recordings").apply { mkdirs() }
        val input=File(dir,"fixture.wav");input.delete()
        state.edit().clear().putString("active_user",uid).putString("generation",token).putString("tree",folder.toString()).commit()
        user.edit().clear().putString("folder",folder.toString()).putStringSet("seen",emptySet()).commit()
        result.edit().clear().commit()
        if(Build.VERSION.SDK_INT>=33) InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("pm grant ${c.packageName} ${Manifest.permission.POST_NOTIFICATIONS}").close()
        val nm=c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager;nm.cancelAll()
        val executor=Executors.newSingleThreadExecutor()
        fun worker()=TestWorkerBuilder<BackgroundCallWorker>(context=c,executor=executor,inputData=workDataOf("user" to uid,"generation" to token)).build()
        assertEquals(0,DocumentFile.fromTreeUri(c,folder)!!.listFiles().size)
        assertEquals(ListenableWorker.Result.success(),worker().doWork())
        c.assets.open("fixture.wav").use { source -> input.outputStream().use { source.copyTo(it) } }
        assertTrue(input.setLastModified(System.currentTimeMillis()-30000))
        val file=DocumentFile.fromTreeUri(c,folder)!!.listFiles().single();val id=file.uri.toString()
        assertEquals(ListenableWorker.Result.success(),worker().doWork())
        assertNull("writing must settle before analysis",result.getString("record_"+BackgroundCalls.key(id),null))
        Thread.sleep(16000)
        assertEquals(ListenableWorker.Result.success(),worker().doWork())
        val raw=result.getString("record_"+BackgroundCalls.key(id),null)
        assertNotNull("worker should save a result for the incoming recording",raw)
        val record=JSONObject(raw!!)
        val transcript=record.optString("transcript")
        val candidate=record.optBoolean("offline_candidate")
        Log.i("AssistantTest","STATUS="+record.optString("status")+" TRANSCRIPT="+transcript+" CANDIDATE="+candidate+" NOTIFICATIONS="+nm.activeNotifications.size)
        assertEquals("확인 필요",record.optString("status"))
        assertTrue("Korean speech should be recognized",transcript.isNotBlank())
        assertTrue("the synthetic recording requests a construction estimate",candidate)
        assertEquals("candidate should generate one notification",1,nm.activeNotifications.size)
        assertEquals(ListenableWorker.Result.success(),worker().doWork())
        assertEquals("the same file must not create duplicate notifications",1,nm.activeNotifications.size)
        Log.i("AssistantTest","PASS file detected; speech decoded; inquiry classified; one notification; duplicate avoided")
        executor.shutdownNow()
    }
}
