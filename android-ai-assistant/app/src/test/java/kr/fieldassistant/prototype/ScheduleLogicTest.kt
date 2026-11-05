package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONArray
import org.json.JSONObject

class ScheduleLogicTest {
    @Test fun firstSyncDoesNotTreatAllOldAppointmentsAsNew() {
        assertEquals(emptySet<String>(), ScheduleLogic.additions(false, emptySet(), setOf("site|2026-11-03")))
    }
    @Test fun onlyAddedDatesTriggerAssignmentAlert() {
        assertEquals(setOf("site|2026-11-05"),ScheduleLogic.additions(true,
            setOf("site|2026-11-03","site|2026-11-04"),setOf("site|2026-11-04","site|2026-11-05")))
    }
    @Test fun reminderOnlyOnAssignedMorningAndAtMostOnce() {
        assertTrue(ScheduleLogic.shouldRemind(7,false,true))
        assertTrue(ScheduleLogic.shouldRemind(11,false,true))
        assertFalse(ScheduleLogic.shouldRemind(6,false,true))
        assertFalse(ScheduleLogic.shouldRemind(12,false,true))
        assertFalse(ScheduleLogic.shouldRemind(8,true,true))
        assertFalse(ScheduleLogic.shouldRemind(8,false,false))
    }
    @Test fun onlyActualAssignedDaysAppearAndCancelledSitesAreExcluded() {
        val site="11111111-1111-1111-1111-111111111111"
        val company="22222222-2222-2222-2222-222222222222"
        val active=JSONObject().put("site_id",site).put("company_id",company).put("status","scheduled")
            .put("site_name","현장").put("address","인천")
            .put("work_dates",JSONArray().put("2026-11-04").put("2026-11-05"))
            .put("assigned_dates",JSONArray().put(JSONObject().put("work_date","2026-11-05")))
        val cancelled=JSONObject(active.toString()).put("status","cancelled")
        val result=ScheduleDates.fromSites(JSONArray().put(active).put(cancelled),"2026-11-04","2026-11-05")
        assertEquals(1,result.size)
        assertEquals("2026-11-05",result.first().date)
        assertEquals("인천",result.first().address)
    }
    @Test fun legacyRangeIsLimitedToTheRequestedWindow() {
        val active=JSONObject().put("site_id","11111111-1111-1111-1111-111111111111")
            .put("company_id","22222222-2222-2222-2222-222222222222").put("status","in_progress")
            .put("schedule_start","2026-11-01").put("schedule_end","2026-11-20")
        val result=ScheduleDates.fromSites(JSONArray().put(active),"2026-11-03","2026-11-04")
        assertEquals(listOf("2026-11-03","2026-11-04"),result.map { it.date })
    }
}
