package kr.fieldassistant.prototype

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReportSubmissionGateTest {
    private fun access()=JSONObject().put("canSubmit",true).put("report",JSONObject.NULL)
    private fun support()=JSONObject().put("report",JSONObject.NULL).put("afterCount",1)
        .put("operations",JSONObject().put("locked",false).put("materials",JSONArray().put(JSONObject().put("returned",0))))
        .put("seed",JSONObject().put("expenses",JSONArray()).put("labor",JSONArray()).put("materials",JSONArray()))

    @Test fun readyNewTrackedReportIsAllowed() { assertNull(ReportSubmissionGate.problem(access(),support())) }
    @Test fun blocksUnauthorizedAndPreviouslySubmittedReports() {
        assertNotNull(ReportSubmissionGate.problem(access().put("canSubmit",false),support()))
        assertNotNull(ReportSubmissionGate.problem(access().put("report",JSONObject().put("review_status","rejected")),support()))
    }
    @Test fun requiresPhotoAndExplicitReturnEvenWhenZero() {
        assertNotNull(ReportSubmissionGate.problem(access(),support().put("afterCount",0)))
        val data=support();data.getJSONObject("operations").getJSONArray("materials").getJSONObject(0).put("returned",JSONObject.NULL)
        assertNotNull(ReportSubmissionGate.problem(access(),data))
    }
    @Test fun protectsExistingCostsAndRejectsUnknownState() {
        val data=support();data.getJSONObject("seed").getJSONArray("labor").put(JSONObject().put("worker_id","worker"))
        assertNotNull(ReportSubmissionGate.problem(access(),data))
        val other=support();other.getJSONObject("operations").remove("locked")
        assertNotNull(ReportSubmissionGate.problem(access(),other))
        val untracked=support();untracked.getJSONObject("operations").put("materials",JSONArray())
        assertNotNull(ReportSubmissionGate.problem(access(),untracked))
    }
}
