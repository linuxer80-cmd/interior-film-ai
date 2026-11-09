package kr.fieldassistant.prototype

import org.junit.Assert.assertEquals
import org.junit.Test

class CallProgressTest {
    @Test fun distinguishesQueuedAndInterruptedWork() {
        assertEquals("분석 대기 · 차례를 기다리고 있어요", CallProgress.label("분석 대기", true, false))
        assertEquals("분석 대기 · 다시 시도 필요", CallProgress.label("분석 대기", false, false))
        assertEquals("분석 상태 확인 필요", CallProgress.label("휴대폰에서 분석 중", false, false))
        assertEquals("분석 중 · 통화를 글자로 바꾸고 있어요", CallProgress.label("휴대폰에서 분석 중", true, false))
    }

    @Test fun reportsCompletionAndFailureWithoutClaimingRegistration() {
        assertEquals("분석 완료 · 상담 내용 확인", CallProgress.label("확인 필요", false, false))
        assertEquals("분석 실패 · 다시 시도 가능", CallProgress.label("분석 실패", false, false))
        assertEquals("현장 등록 완료", CallProgress.label("현장 등록 완료", false, false))
    }
}
