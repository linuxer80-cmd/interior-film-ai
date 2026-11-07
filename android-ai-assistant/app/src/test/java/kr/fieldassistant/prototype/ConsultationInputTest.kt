package kr.fieldassistant.prototype
import org.junit.Assert.*
import org.junit.Test
class ConsultationInputTest {
    @Test fun normalizesDistinctDatesWithoutGuessing() {
        assertEquals(listOf("2026-11-07","2026-11-08"),ConsultationInput.dates("2026-11-08, 2026-11-07\n2026-11-08"))
        assertTrue(ConsultationInput.dates("").isEmpty())
    }
    @Test fun rejectsImpossibleAndAmbiguousDates() {
        for(value in listOf("2026-02-30","내일","11/7","2026-1-01")) {
            assertTrue(runCatching { ConsultationInput.dates(value) }.isFailure)
        }
    }
    @Test fun preservesUnknownVersusZeroMoney() {
        assertEquals("",ConsultationInput.amount(" "))
        assertEquals("0",ConsultationInput.amount("0"))
        assertEquals("1200000",ConsultationInput.amount("1200000"))
        for(value in listOf("120만원","-1","1.5","1000000000000")) assertTrue(runCatching { ConsultationInput.amount(value) }.isFailure)
    }
}
