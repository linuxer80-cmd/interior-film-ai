package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class NotificationPolicyTest {
    @Test fun reportsEnabledOnlyWhenAllSystemControlsAllowIt() {
        assertTrue(NotificationPolicy.enabled(true,true,true))
        assertFalse(NotificationPolicy.enabled(false,true,true))
        assertFalse(NotificationPolicy.enabled(true,false,true))
        assertFalse(NotificationPolicy.enabled(true,true,false))
    }
    @Test fun requestsInitiallyOrWithRationaleButUsesSettingsWhenBlocked() {
        assertTrue(NotificationPolicy.shouldRequestPermission(false,false,false))
        assertTrue(NotificationPolicy.shouldRequestPermission(false,true,true))
        assertFalse(NotificationPolicy.shouldRequestPermission(false,true,false))
        assertFalse(NotificationPolicy.shouldRequestPermission(true,false,false))
    }
}
