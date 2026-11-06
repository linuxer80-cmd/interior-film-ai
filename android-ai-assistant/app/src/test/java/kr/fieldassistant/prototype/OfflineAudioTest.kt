package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class OfflineAudioTest {
    @Test fun recognizesClearQuoteRequestsWithoutClassifyingEveryPriceMention() {
        assertTrue(InquiryMatcher.likely("싱크대 견적 좀 받을 수 있나요"))
        assertTrue(InquiryMatcher.likely("다음 주에 시공 가능할까요"))
        assertTrue(InquiryMatcher.likely("견 적 부탁합니다"))
        assertFalse(InquiryMatcher.likely(""))
        assertFalse(InquiryMatcher.likely("오늘 저녁에 식사해요"))
        assertTrue(InquiryMatcher.likely("필름 시공 비용이 얼마인가요"))
        assertTrue(InquiryMatcher.likely("도배 가격 알려주세요"))
        assertFalse(InquiryMatcher.likely("점심 메뉴가 얼마인지 알려주세요"))
        assertFalse(InquiryMatcher.likely("내일 만나요"))
        assertTrue(InquiryMatcher.likely("인테리어 필름 작업 가능한가요"))
        assertTrue(InquiryMatcher.likely("시트지 작업 가능한가요"))
        assertTrue(InquiryMatcher.likely("문의 드리려고 전화했습니다"))
        assertTrue(InquiryMatcher.likely("필름 작업 해주세요"))
    }
    @Test fun chunkedResamplingMatchesContinuousInput() {
        val samples=ShortArray(1200) { ((it*91)%20000-10000).toShort() }
        for(rate in listOf(8000,16000,44100,48000)) {
            val one=StreamingResampler(rate).convert(samples)
            val chunked=StreamingResampler(rate)
            val a=chunked.convert(samples.copyOfRange(0,347))
            val b=chunked.convert(samples.copyOfRange(347,800))
            val c=chunked.convert(samples.copyOfRange(800,samples.size))
            assertArrayEquals("rate=$rate",one,a+b+c)
        }
    }
}
