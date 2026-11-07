package kr.fieldassistant.prototype
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class NotificationHistoryTest {
    private val now=1_800_000_000_000L
    private fun entry(id:String,time:Long=now,read:Boolean=false)=JSONObject().put("key",id).put("time",time).put("read",read)
    @Test fun redeliveryPreservesReadStateAndOriginalTime() {
        val result=NotificationHistory.append(listOf(entry("message",now-1000,true)),entry("message"))
        assertEquals(1,result.size);assertTrue(result.single().getBoolean("read"));assertEquals(now-1000,result.single().getLong("time"))
    }
    @Test fun expiresOldHistoryAndRejectsFutureOrInvalidEntries() {
        val raw=JSONArray(listOf(entry("old",now-31L*86400000),entry("current"),entry("future",now+1),JSONObject())).toString()
        assertEquals(listOf("current"),NotificationHistory.retained(raw,now).map { it.getString("key") })
        assertTrue(NotificationHistory.retained("broken",now).isEmpty())
    }
    @Test fun keepsNewestTwoHundredAndDeduplicates() {
        val raw=JSONArray((0..250).map { entry("id$it",now-it) }+entry("id0")).toString()
        val kept=NotificationHistory.retained(raw,now)
        assertEquals(200,kept.size);assertEquals("id0",kept.first().getString("key"));assertEquals("id199",kept.last().getString("key"))
        val next=NotificationHistory.append(kept,entry("new"))
        assertEquals(200,next.size);assertEquals("new",next.first().getString("key"));assertEquals("id198",next.last().getString("key"))
    }
}
