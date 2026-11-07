package kr.fieldassistant.prototype
import org.junit.Assert.*
import org.junit.Test
class CallRetryPolicyTest {
    @Test fun retriesOnlyFailedFirstAndSecondAttempts() {
        assertTrue(CallRetryPolicy.shouldRetry(true,1))
        assertTrue(CallRetryPolicy.shouldRetry(true,2))
        assertFalse(CallRetryPolicy.shouldRetry(true,3))
        assertFalse(CallRetryPolicy.shouldRetry(false,1))
        assertFalse(CallRetryPolicy.shouldRetry(false,2))
    }
}
