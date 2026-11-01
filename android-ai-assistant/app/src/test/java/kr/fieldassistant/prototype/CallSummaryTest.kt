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
}
