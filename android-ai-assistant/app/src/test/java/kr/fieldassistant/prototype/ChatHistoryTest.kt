package kr.fieldassistant.prototype
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class ChatHistoryTest {
    private fun row(id:String,time:String,body:String)=JSONObject().put("id",id).put("created_at",time).put("body",body)
    @Test fun retainsOlderMessagesAndRefreshesOverlappingRows() {
        val history=listOf(row("a","2026-11-01","old"),row("b","2026-11-02","stale"))
        val merged=ChatHistory.merge(history,JSONArray().put(row("c","2026-11-03","new")).put(row("b","2026-11-02","fresh")))
        assertEquals(3,merged.length())
        assertEquals("a",merged.getJSONObject(0).getString("id"))
        assertEquals("fresh",merged.getJSONObject(1).getString("body"))
        assertEquals("c",merged.getJSONObject(2).getString("id"))
    }
    @Test fun keepsStableOrderingForSameTimestamp() {
        val merged=ChatHistory.merge(emptyList(),JSONArray().put(row("b","2026-11-01","b")).put(row("a","2026-11-01","a")))
        assertEquals("a",merged.getJSONObject(0).getString("id"))
    }
    @Test fun teamCursorIncludesTieBreakerAndCustomerKeepsExistingCursor() {
        val r=row("a","2026-11-07T00:00:00.000001+00:00","body")
        assertEquals("2026-11-07T00:00:00.000001+00:00|a",ChatHistory.before(r,"team"))
        assertEquals("2026-11-07T00:00:00.000001+00:00",ChatHistory.before(r,"customer"))
    }
    @Test fun displaysKoreanTimeAcrossMidnightWithoutChangingDeviceTimezone() {
        assertEquals("2026-11-08 00:30",ChatHistory.displayTime("2026-11-07T15:30:00Z"))
        assertEquals("2026-11-08 00:30",ChatHistory.displayTime("2026-11-08T00:30:00+09:00"))
        assertEquals("시간 확인 중",ChatHistory.displayTime("not a date"))
    }
}
