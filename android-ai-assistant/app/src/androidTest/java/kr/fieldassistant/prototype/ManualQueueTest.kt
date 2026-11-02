package kr.fieldassistant.prototype

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.provider.DocumentsContract
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class ManualQueueTest {
    @Test fun manualRequestWaitsForScanAndThenAnalyzesWithoutAnotherTap() {
        val c=ApplicationProvider.getApplicationContext<Context>()
        val inst=InstrumentationRegistry.getInstrumentation()
        val uid="manual-queue-test"
        val folder=DocumentsContract.buildTreeDocumentUri(c.packageName+".fake-recordings","root")
        val dir=File(c.filesDir,"fake-recordings").apply { mkdirs() }
        val input=File(dir,"fixture.m4a")
        c.assets.open("fixture.m4a").use { src -> input.outputStream().use { src.copyTo(it) } }
        val id=DocumentFile.fromTreeUri(c,folder)!!.listFiles().single().uri.toString()
        val user=c.getSharedPreferences("assistant_user_$uid",Context.MODE_PRIVATE)
        user.edit().clear().putString("records",JSONArray().put(JSONObject().put("id",id).put("name","synthetic.m4a").put("status","분석 대기")).toString()).commit()
        val activity=inst.startActivitySync(Intent(c,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        Thread.sleep(2500);inst.waitForIdleSync()
        BackgroundCalls.running.set(true)
        try {
            inst.runOnMainSync {
                MainActivity::class.java.getDeclaredField("account").apply { isAccessible=true }.set(activity,VerifiedAccount(uid,listOf(CompanyAccess("test","Test","관리자"))))
                MainActivity::class.java.getDeclaredMethod("retryOffline",String::class.java).apply { isAccessible=true }.invoke(activity,id)
            }
            fun record()=JSONArray(user.getString("records","[]")).getJSONObject(0)
            assertEquals("분석 대기",record().optString("status"))
            assertTrue(record().optString("summary").contains("자동으로 분석"))
            Thread.sleep(1800)
            assertEquals("must wait while scan is running","분석 대기",record().optString("status"))
            BackgroundCalls.running.set(false)
            val deadline=SystemClock.elapsedRealtime()+120000
            while(SystemClock.elapsedRealtime()<deadline && record().optString("status") !in listOf("확인 필요","분석 실패")) Thread.sleep(500)
            val result=record()
            Log.i("AssistantTest","QUEUE STATUS="+result.optString("status")+" TRANSCRIPT_PRESENT="+result.optString("transcript").isNotBlank())
            assertEquals("queued request should start automatically after scan","확인 필요",result.optString("status"))
            assertTrue(result.optString("transcript").isNotBlank())
        } finally {
            BackgroundCalls.running.set(false)
            inst.runOnMainSync { activity.finish() }
        }
    }
}
