package kr.fieldassistant.prototype
import org.junit.Assert.*
import org.junit.Test
class CallRetryPolicyTest {
    @Test fun emptyFilesAndFailedAnalysisAreNeverReportedAsNoRecordings() {
        assertTrue(CallRetryPolicy.retryEmpty(0));assertTrue(CallRetryPolicy.retryEmpty(5));assertFalse(CallRetryPolicy.retryEmpty(6))
        assertTrue(CallRetryPolicy.scanSummary(false,1,0,0).contains("비어 있는 녹음"))
        assertTrue(CallRetryPolicy.scanSummary(true,1,0,0).contains("다시 확인"))
        assertTrue(CallRetryPolicy.scanSummary(false,0,1,1).contains("분석하지 못한 녹음"))
        assertTrue(CallRetryPolicy.scanSummary(false,0,0,0).contains("새 녹음이 없습니다"))
    }
    @Test fun retriesOnlyFailedFirstAndSecondAttempts() {
        assertTrue(CallRetryPolicy.shouldRetry(true,1))
        assertTrue(CallRetryPolicy.shouldRetry(true,2))
        assertFalse(CallRetryPolicy.shouldRetry(true,3))
        assertFalse(CallRetryPolicy.shouldRetry(false,1))
        assertFalse(CallRetryPolicy.shouldRetry(false,2))
    }
}
