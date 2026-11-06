package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class RecordingMonitorHealthTest {
    @Test fun missingPermissionAndDisabledNotificationsAreNotReportedAsReady() {
        assertTrue(RecordingMonitorHealth.state(true,false,true,true,100,100).contains("권한"))
        assertTrue(RecordingMonitorHealth.state(true,true,false,true,100,100).contains("알림"))
        assertTrue(RecordingMonitorHealth.state(true,true,true,false,100,100).contains("시작되지"))
    }
    @Test fun missingOrStaleChecksAreNotReportedAsSuccessful() {
        assertTrue(RecordingMonitorHealth.state(true,true,true,true,0,100).contains("기다리고"))
        assertTrue(RecordingMonitorHealth.state(true,true,true,true,1,31L*60*1000).contains("오래"))
        assertTrue(RecordingMonitorHealth.state(true,true,true,true,100,100).contains("연결"))
    }
}
