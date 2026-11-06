package kr.fieldassistant.prototype

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AdminReportDisplayTest {
    @Test fun laborIsPresentedAsHumanReadableCosts() {
        val labor=JSONObject().put("name","홍길동").put("days",2).put("dailyWage",250000).put("allowance",10000)
        val row=JSONObject().put("amount",510000).put("description","완료보고/인건비:"+labor)
        val line=AdminReportDisplay.expense(row)
        assertTrue(line.contains("홍길동"));assertTrue(line.contains("2일"));assertTrue(line.contains("510000원"));assertFalse(line.contains("workerId"))
    }
    @Test fun invalidLaborDoesNotShowRawSavedData() {
        val line=AdminReportDisplay.expense(JSONObject().put("amount",100).put("description","완료보고/인건비:{bad}"))
        assertTrue(line.contains("상세 확인 필요"));assertFalse(line.contains("{bad}"))
    }
    @Test fun regularExpenseKeepsUserDescription() {
        val line=AdminReportDisplay.expense(JSONObject().put("expense_type","parking").put("amount",3000).put("description","완료보고/주차"))
        assertEquals("주차비 · 3000원 · 주차",line)
    }
}
