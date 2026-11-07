package kr.fieldassistant.prototype
import org.junit.Assert.*
import org.junit.Test
class ConsultationInputTest {
    @Test fun normalizesDistinctDatesWithoutGuessing() {
        assertEquals(listOf("2026-11-07","2026-11-08"),ConsultationInput.dates("2026-11-08, 2026-11-07\n2026-11-08"))
        assertTrue(ConsultationInput.dates("").isEmpty())
    }
    @Test fun rejectsImpossibleAndAmbiguousDates() {
        for(value in listOf("2026-02-30","내일","11/7","2026-13-01")) {
            assertTrue(runCatching { ConsultationInput.dates(value) }.isFailure)
        }
    }
    @Test fun preservesUnknownVersusZeroMoney() {
        assertEquals("",ConsultationInput.amount(" "))
        assertEquals("0",ConsultationInput.amount("0"))
        assertEquals("1200000",ConsultationInput.amount("1200000"))
        for(value in listOf("-1","1.5","1000000000000")) assertTrue(runCatching { ConsultationInput.amount(value) }.isFailure)
    }
    @Test fun acceptsExplicitYearFormatsAndDeduplicatesEquivalentDates() {
        assertEquals(listOf("2026-01-01","2026-11-07"),ConsultationInput.dates("2026-1-1, 2026/11/7, 2026.11.07, 2026년 11월 7일"))
        assertEquals(listOf("2028-02-29"),ConsultationInput.dates("2028/2/29"))
        for(raw in listOf("2026/2/29","2026-11/7","11월 7일","2026/11/7~2026/11/8"))assertTrue(raw,runCatching {ConsultationInput.dates(raw)}.isFailure)
    }
    @Test fun moneyIsStoredAsExactWholeWon() {
        for(raw in listOf("250,000원","250000","25만원","25.0000만원","000250000"))assertEquals(raw,"250000",ConsultationInput.amount(raw))
        assertEquals("125000",ConsultationInput.amount("12.5만원"))
        assertEquals("1",ConsultationInput.amount("0.0001만원"))
        assertEquals("0",ConsultationInput.amount("0만원"))
        for(raw in listOf("1,00","1,000,00원","1.5원","0.00001만원","-25만원","1e6","100000000만원","25만"))assertTrue(raw,runCatching {ConsultationInput.amount(raw)}.isFailure)
    }
}
