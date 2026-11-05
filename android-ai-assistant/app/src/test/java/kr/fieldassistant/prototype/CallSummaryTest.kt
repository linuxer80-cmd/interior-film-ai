package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class CallSummaryTest {
    @Test fun asksOnlyForExplicitPositiveClassification() {
        assertTrue(CallSummary.isEstimateInquiry("시공 문의 가능성: 있음\n요약: 싱크대 문의"))
        assertTrue(CallSummary.isEstimateInquiry("**시공 문의 가능성： 있음**\n요약: 문의"))
        assertFalse(CallSummary.isEstimateInquiry("시공 문의 가능성: 낮음\n있음"))
        assertFalse(CallSummary.isEstimateInquiry("시공 문의 가능성: 확인 필요"))
        assertFalse(CallSummary.isEstimateInquiry("시공 문의 가능성: 없음"))
    }
    @Test fun unknownValuesAreNotCopiedAsCustomerDetails() {
        val summary="현장명: 확인 필요\n고객명: 홍길동\n주소： 미정\n시공 부위: 싱크대"
        assertEquals("",CallSummary.field(summary,"현장명"))
        assertEquals("홍길동",CallSummary.field(summary,"고객명"))
        assertEquals("",CallSummary.field(summary,"주소"))
        assertEquals("싱크대",CallSummary.field(summary,"시공 부위"))
        assertEquals("",CallSummary.field(summary,"전화번호"))
    }
    @Test fun callMemoUsesTheStructuredSummaryAndSchedule() {
        val memo=CallDraftHints.reviewMemo("시공 문의 가능성: 있음\n요약: 싱크대와 문틀 색상 변경 문의\n희망 일정: 다음 주 화요일", "unused")
        assertTrue(memo.contains("싱크대와 문틀"));assertTrue(memo.contains("다음 주 화요일"))
    }
    @Test fun sparseBackgroundSummaryExtractsOnlyReviewedPartsNotWholeTranscript() {
        val transcript="안녕하세요 반갑습니다 오늘 통화드린 이유가 있습니다. "+"싱크대 문짝 필름 견적이 궁금하고 다음 주 화요일에 방문 가능한지 문의드려요. "+"나머지 세부 내용은 확인한 다음 다시 이야기하겠습니다. 즐거운 하루 보내세요."
        val memo=CallDraftHints.reviewMemo("견적 문의 가능성 있음\n휴대폰에서 음성을 분석했습니다. 내용을 확인해 주세요.", transcript)
        assertTrue(memo.contains("발췌"));assertTrue(memo.contains("싱크대"));assertFalse(memo.contains(transcript))
    }
    @Test fun noDetailsAreInventedWhenNothingUsefulIsRecognized() {
        assertEquals("상담 내용을 확인한 뒤 입력해 주세요.",CallDraftHints.reviewMemo("견적 문의 가능성 있음", "네 알겠습니다"))
    }
}
