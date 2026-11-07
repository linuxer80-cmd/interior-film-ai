package kr.fieldassistant.prototype
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class ConsultationFollowUpTest {
    private fun item(stage:String="draft",date:String="")=JSONObject().put("chat_company","company").put("chat_draft",JSONObject()).put("follow_up",JSONObject().put("stage",stage).put("date",date))
    @Test fun waitingMovesToActionOnContactDate() {
        assertTrue(ConsultationFollowUp.waiting(item("waiting","2026-11-08"),"2026-11-07"))
        assertFalse(ConsultationFollowUp.waiting(item("waiting","2026-11-07"),"2026-11-07"))
        assertFalse(ConsultationFollowUp.waiting(item("waiting","2026-11-06"),"2026-11-07"))
        assertTrue(ConsultationFollowUp.waiting(item("waiting"),"2026-11-07"))
    }
    @Test fun excludesForeignCompanyDeclinedAndClosedConsultations() {
        assertTrue(ConsultationFollowUp.eligible(item(),"company","active"))
        assertFalse(ConsultationFollowUp.eligible(item(),"other","active"))
        assertFalse(ConsultationFollowUp.eligible(item(),"company","declined"))
        assertFalse(ConsultationFollowUp.eligible(item("closed"),"company","active"))
        assertFalse(ConsultationFollowUp.eligible(JSONObject().put("chat_company","company"),"company","active"))
    }
    @Test fun contactDateMustBeOneRealExplicitDate() {
        assertEquals("",ConsultationFollowUp.normalizedDate(""))
        assertEquals("2026-11-08",ConsultationFollowUp.normalizedDate("2026년 11월 8일"))
        for(date in listOf("11/8","2026-02-30","2026-11-08,2026-11-09")) assertTrue(runCatching {ConsultationFollowUp.normalizedDate(date)}.isFailure)
    }
    @Test fun overdueWorkPrecedesWaitingAndUnscheduledWork() {
        val overdue=item("waiting","2026-11-06");val waiting=item("waiting","2026-11-09");val unscheduled=item()
        assertEquals(listOf(overdue,unscheduled,waiting),ConsultationFollowUp.ordered(listOf(waiting,unscheduled,overdue),"2026-11-07"))
    }
}
