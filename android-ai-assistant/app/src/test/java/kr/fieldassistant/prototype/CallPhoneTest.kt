package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class CallPhoneTest {
    @Test fun recordingNamesIncludeMobileLandlineAndInternetCalls() {
        val cases=mapOf("통화 녹음 010-1234-5678_261107_101010.m4a" to "01012345678",
            "드림아트 032-123-4567_20261107.m4a" to "0321234567",
            "상담 02-1234-5678_261107.m4a" to "0212345678",
            "통화 070-1234-5678.m4a" to "07012345678",
            "통화 +82 10-1234-5678.m4a" to "01012345678",
            "통화 +82 32-123-4567.m4a" to "0321234567")
        cases.forEach { (name,phone)->assertEquals(name,phone,CallDraftHints.phone(name)) }
    }
    @Test fun internationalAndDomesticFormsMatchSameCustomer() {
        for(raw in listOf("+82 10-1234-5678","0082-10-1234-5678","+82 (0)10 1234 5678"))
            assertTrue(raw,CallReview.samePhone(raw,"01012345678"))
        assertTrue(CallReview.samePhone("+82 2 123 4567","02-123-4567"))
        assertFalse(CallReview.samePhone("+81 10 1234 5678","01012345678"))
    }
    @Test fun rejectsPartialNumbersMultipleContactsAndDates() {
        for(raw in listOf("1234-5678","010123456789","010-1234-5678 / 032-123-4567","010-1234-5678 내선 1","2026-11-07 10:10:10","0001234567"))
            assertEquals(raw,"",CallReview.phone(raw))
        for(name in listOf("통화_20261107_101010.m4a","고객 01012345678 0321234567.m4a","번호 0010123456789.m4a"))
            assertEquals(name,"",CallDraftHints.phone(name))
        assertEquals("01012345678",CallDraftHints.phone("01012345678 +82-10-1234-5678.m4a"))
    }
    @Test fun preservesSelectedSiteAcrossFormattingChangesOnly() {
        val id="44444444-4444-4444-8444-444444444444"
        assertEquals(id,CallReview.selectedTarget(id,"+82 32 123 4567","032-123-4567"))
        assertNull(CallReview.selectedTarget(id,"+82 32 123 4567","032-999-9999"))
    }
}
