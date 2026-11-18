package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class CallReviewTest {
    @Test fun addressWarningsRequireSubstantialMatch() {
        assertTrue(CallReview.similarAddress("인천 서구 청라대로 123", "인천서구청라대로123"))
        assertFalse(CallReview.similarAddress("인천 서구", "인천 서구"))
        assertFalse(CallReview.similarAddress("인천 서구 청라대로 123", "인천 서구 청라대로 124"))
    }
    @Test fun matchesCompleteNumbersOnly() {
        assertTrue(CallReview.samePhone("010-1234-5678","010 1234 5678"))
        assertFalse(CallReview.samePhone("1234-5678","010-1234-5678"))
        assertFalse(CallReview.samePhone("", ""))
        assertFalse(CallReview.samePhone("01012345678","01012345679"))
    }
    @Test fun selectedTargetIsClearedWhenPhoneChanges() {
        val id="44444444-4444-4444-8444-444444444444"
        assertEquals(id,CallReview.selectedTarget(id,"010-1234-5678","01012345678"))
        assertNull(CallReview.selectedTarget(id,"010-1234-5678","01099999999"))
        assertNull(CallReview.selectedTarget("invalid","01012345678","01012345678"))
    }
    @Test fun preservesSeparateCodesWithoutGuessing() {
        val e=CallReview.evidence("다음 주 화요일에 S115인지 GS115인지 확인해요. 비용은 50만원이에요.")
        assertEquals(listOf("S115","GS115"),e.codes)
        assertTrue(e.dates.contains("다음 주"));assertTrue(e.dates.contains("화요일"))
        assertEquals(listOf("50만원"),e.amounts)
    }
    @Test fun missingEvidenceIsNotInvented() {
        val e=CallReview.evidence("안녕하세요 통화 고맙습니다.")
        assertTrue(e.codes.isEmpty());assertTrue(e.dates.isEmpty());assertTrue(e.amounts.isEmpty())
    }
    @Test fun candidateListsAreBoundedAndDeduplicated() {
        val e=CallReview.evidence("S115 S115 GS115 S116 S117 S118 S119")
        assertEquals(listOf("S115","GS115","S116","S117","S118"),e.codes)
    }
}
