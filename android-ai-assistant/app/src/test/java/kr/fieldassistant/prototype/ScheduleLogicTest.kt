package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

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
}
