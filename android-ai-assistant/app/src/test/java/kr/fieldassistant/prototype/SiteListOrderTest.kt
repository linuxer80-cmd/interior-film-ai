package kr.fieldassistant.prototype

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SiteListOrderTest {
    @Test fun newConsultationAppearsAmongFirstTwentyEvenWhenNameSortsLast() {
        val existing=(1..81).map { JSONObject().put("id",it).put("site_name","가현장 $it").put("created_at","2026-10-01T00:00:00Z") }
        val new=JSONObject().put("id",82).put("site_name","통화 상담 2026-11-05 15:24").put("status","consulting").put("created_at","2026-11-05T06:25:33Z")
        val ordered=SiteListOrder.newestFirst(existing+new)
        assertEquals(82,ordered.first().getInt("id"))
        assertTrue(ordered.take(20).any { it.getInt("id")==82 })
        assertEquals(82,ordered.chunked(20).sumOf { it.size })
    }
    @Test fun recordsWithoutCreationDateRemainVisibleAndHaveStableNameOrder() {
        val sites=listOf(JSONObject().put("site_name","나"),JSONObject().put("site_name","가"))
        assertEquals(listOf("가","나"),SiteListOrder.newestFirst(sites).map { it.getString("site_name") })
    }
}
