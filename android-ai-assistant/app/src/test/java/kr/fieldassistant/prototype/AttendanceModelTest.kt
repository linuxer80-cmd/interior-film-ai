package kr.fieldassistant.prototype
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AttendanceModelTest {
    private fun data()=JSONObject().put("workers",JSONArray().put(JSONObject().put("id","w").put("company_id","a")))
        .put("sites",JSONArray().put(JSONObject().put("id","s").put("company_id","a").put("canClockIn",true)).put(JSONObject().put("id","other").put("company_id","b").put("canClockIn",true)))
        .put("records",JSONArray())
    @Test fun onlyCurrentCompanyAndOwnWorkerRecordsAreVisible() {
        val d=data();d.getJSONArray("records").put(JSONObject().put("company_id","a").put("worker_id","other"))
            .put(JSONObject().put("company_id","b").put("worker_id","w"))
        assertEquals(0,AttendanceModel.rows(AttendanceModel.scoped(d,"a"),"records").size)
        assertEquals(1,AttendanceModel.rows(AttendanceModel.scoped(d,"a"),"sites").size)
        assertFalse(AttendanceModel.allowed(d,"a",JSONObject().put("action","in").put("siteId","other")))
    }
    @Test fun openRecordsBlockAnotherClockInAndAllowOnlyTheirClockOut() {
        val d=data();val incoming=JSONObject().put("action","in").put("siteId","s")
        assertTrue(AttendanceModel.allowed(d,"a",incoming))
        d.getJSONArray("records").put(JSONObject().put("company_id","a").put("worker_id","w").put("id","r").put("clock_out",JSONObject.NULL))
        assertFalse(AttendanceModel.allowed(d,"a",incoming))
        assertTrue(AttendanceModel.allowed(d,"a",JSONObject().put("action","out").put("id","r")))
        d.getJSONArray("records").getJSONObject(0).put("clock_out","2026-11-07T08:00:00Z")
        assertFalse(AttendanceModel.allowed(d,"a",JSONObject().put("action","out").put("id","r")))
        assertFalse(AttendanceModel.allowed(d,"a",JSONObject().put("action","correct")))
    }
    @Test fun staleOrInvalidLocationsAreRejected() {
        assertTrue(AttendanceModel.validGps(37.4,126.8,12.0,1000))
        assertFalse(AttendanceModel.validGps(37.4,126.8,12.0,120001))
        assertFalse(AttendanceModel.validGps(37.4,126.8,12.0,-1))
        assertFalse(AttendanceModel.validGps(Double.NaN,126.8,12.0,1000))
        assertFalse(AttendanceModel.validGps(91.0,126.8,12.0,1000))
        assertEquals("11/07 09:00",AttendanceModel.time("2026-11-07T00:00:00Z"))
    }
    @Test fun attendanceUsesNativeScreenForBothRoles() {
        assertFalse(AssistantRequests.opensWeb("attendance"))
        assertNotNull(AssistantRequests.feature("attendance",false))
        assertNotNull(AssistantRequests.feature("attendance",true))
    }
}
