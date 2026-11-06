package kr.fieldassistant.prototype

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DealerReceiptStateTest {
    @Test fun confirmsOnlyMatchingRow() {
        val draft="""{"analysis":{"rows":[{"_requestId":"first"},{"_requestId":"second"}]}}"""
        val rows=JSONObject(DealerReceiptState.confirmed(draft,"first")).getJSONObject("analysis").getJSONArray("rows")
        assertTrue(rows.getJSONObject(0).getBoolean("_done"))
        assertFalse(rows.getJSONObject(0).has("_requestId"))
        assertEquals("second",rows.getJSONObject(1).getString("_requestId"))
        assertFalse(rows.getJSONObject(1).optBoolean("_done"))
    }
    @Test fun manualReceiveDoesNotCompleteAReceiptRow() {
        val draft="""{"analysis":{"rows":[{"_requestId":"receipt"}]}}"""
        val row=JSONObject(DealerReceiptState.confirmed(draft,"manual")).getJSONObject("analysis").getJSONArray("rows").getJSONObject(0)
        assertEquals("receipt",row.getString("_requestId"))
        assertFalse(row.optBoolean("_done"))
    }
    @Test(expected=IllegalStateException::class) fun refusesAmbiguousRequest() {
        DealerReceiptState.confirmed("""{"analysis":{"rows":[{"_requestId":"same"},{"_requestId":"same"}]}}""","same")
    }
}
