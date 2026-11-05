package kr.fieldassistant.prototype
import org.junit.Assert.*
import org.junit.Test

class AssistantInputSafetyTest {
    @Test fun combinedInstructionsAreNotPartiallySaved() {
        assertTrue(AssistantInputSafety.mixesWorkChanges("문 세 개 작업 완료, S115 8m 사용, 주차비 8천원"))
        assertTrue(AssistantInputSafety.mixesWorkChanges("싱크대 작업 완료, 주차비 8천원"))
        assertTrue(AssistantInputSafety.mixesWorkChanges("문 세 개 완료, S115 8m, 주차비 8천원"))
        assertFalse(AssistantInputSafety.mixesWorkChanges("주차비 8천원"))
        assertFalse(AssistantInputSafety.mixesWorkChanges("S115 8m 사용"))
    }
}
