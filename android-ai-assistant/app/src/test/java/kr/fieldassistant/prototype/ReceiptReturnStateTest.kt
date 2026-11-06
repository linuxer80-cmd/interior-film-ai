package kr.fieldassistant.prototype

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReceiptReturnStateTest {
    private val draft="""{"analysis":{"rows":[{"action":"supplier_return","_returnRemaining":"20","_returnPending":"abc"}]}}"""
    @Test fun partialReturnKeepsTheUnreturnedBalance() {
        val row=JSONObject(ReceiptReturnState.complete(draft,0,"abc","7.5","roll-1")).getJSONObject("analysis").getJSONArray("rows").getJSONObject(0)
        assertEquals("12.5",row.getString("_returnRemaining"));assertFalse(row.optBoolean("_done"));assertEquals(1,row.getInt("_returnCount"));assertFalse(row.has("_returnPending"))
    }
    @Test fun fullReturnCompletesOnlyTheMatchingPendingRequest() {
        val row=JSONObject(ReceiptReturnState.complete(draft,0,"abc","20","roll-1")).getJSONObject("analysis").getJSONArray("rows").getJSONObject(0)
        assertTrue(row.getBoolean("_done"));assertEquals("0",row.getString("_returnRemaining"))
    }
    @Test(expected=IllegalStateException::class) fun wrongRequestCannotMarkReturnComplete() { ReceiptReturnState.complete(draft,0,"other","20","roll-1") }
    @Test(expected=IllegalArgumentException::class) fun cannotReturnMoreThanOutstanding() { ReceiptReturnState.complete(draft,0,"abc","21","roll-1") }
}
