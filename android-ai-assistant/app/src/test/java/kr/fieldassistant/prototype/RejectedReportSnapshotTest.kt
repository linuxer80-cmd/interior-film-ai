package kr.fieldassistant.prototype

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class RejectedReportSnapshotTest {
    private fun report()=JSONObject().put("id","report-1").put("updated_at","2026-11-03T10:00:00Z").put("review_status","rejected")
    private fun access()=JSONObject().put("canSubmit",true).put("report",report())
    private fun support()=JSONObject().put("report",report())
    @Test fun sameRevisionAndPermissionAreRequired() {
        assertTrue(RejectedReportSnapshot.matches(access(),support()))
        assertFalse(RejectedReportSnapshot.matches(access().put("canSubmit",false),support()))
        assertFalse(RejectedReportSnapshot.matches(access(),support().put("report",report().put("id","other"))))
        assertFalse(RejectedReportSnapshot.matches(access(),support().put("report",report().put("updated_at","changed"))))
        val missingRevision=report();missingRevision.remove("updated_at")
        assertFalse(RejectedReportSnapshot.matches(access(),support().put("report",missingRevision)))
        assertFalse(RejectedReportSnapshot.matches(access(),support().put("report",report().put("review_status","approved"))))
    }
}
