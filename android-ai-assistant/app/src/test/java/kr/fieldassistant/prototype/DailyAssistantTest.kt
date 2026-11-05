package kr.fieldassistant.prototype

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DailyAssistantTest {
    private val co="11111111-1111-4111-8111-111111111111"
    private val id="22222222-2222-4222-8222-222222222222"
    @Test fun showsOnlySelectedCompanyAndAssignedDay() {
        val site=JSONObject().put("company_id",co).put("id",id).put("site_name","청라").put("status","scheduled")
            .put("assigned_dates",JSONArray().put(JSONObject().put("work_date","2026-11-05")))
            .put("work_dates",JSONArray().put("2026-11-05").put("2026-11-06"))
        val result=DailyAssistant.briefing(JSONArray().put(site),co,false,"2026-11-05")
        assertEquals(1,result.sites.size);assertNull(result.consultations)
        assertTrue(DailyAssistant.briefing(JSONArray().put(site),co,false,"2026-11-06").sites.isEmpty())
        assertTrue(DailyAssistant.briefing(JSONArray().put(site),"other",true,"2026-11-05").sites.isEmpty())
    }
    @Test fun cancelledSitesNeverAppearAsTodayWork() {
        val site=JSONObject().put("company_id",co).put("id",id).put("status","cancelled").put("work_dates",JSONArray().put("2026-11-05"))
        assertTrue(DailyAssistant.briefing(JSONArray().put(site),co,true,"2026-11-05").sites.isEmpty())
    }
    @Test fun timestampsUseKoreanDay() {
        val site=JSONObject().put("company_id",co).put("id",id).put("status","scheduled")
            .put("schedule_start","2026-11-04T15:00:00+00:00").put("schedule_end","2026-11-05T14:59:00+00:00")
        assertEquals(1,DailyAssistant.briefing(JSONArray().put(site),co,true,"2026-11-05").sites.size)
        assertTrue(DailyAssistant.briefing(JSONArray().put(site),co,true,"2026-11-04").sites.isEmpty())
    }
    @Test fun failuresDoNotPretendReportOrMaterialsAreCompleted() {
        val value=DailyAssistant.wrapUp(id,null,null,null)
        assertTrue(value.contains("완료보고: 확인하지 못했습니다"));assertTrue(value.contains("자재 반입: 확인하지 못했습니다"))
    }
    @Test fun pendingReportAndUnreturnedRollAreShownWithoutWriting() {
        val report=JSONObject().put("report",JSONObject().put("review_status","pending"))
        val support=JSONObject().put("afterCount",0)
        val stock=JSONObject().put("trips",JSONArray().put(JSONObject().put("site_id",id).put("returned",JSONObject.NULL)))
        val text=DailyAssistant.wrapUp(id,report,support,stock)
        assertTrue(text.contains("검수 대기"));assertTrue(text.contains("등록된 사진 없음"));assertTrue(text.contains("반출 롤: 1개"))
    }
}
