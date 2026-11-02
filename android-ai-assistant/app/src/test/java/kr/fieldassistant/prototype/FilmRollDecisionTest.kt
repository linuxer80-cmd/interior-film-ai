package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test
import java.math.BigDecimal

class FilmRollDecisionTest {
    private val roll=FilmRollDecision.Roll("site","roll","S115",BigDecimal("10"),1,false,"롤 1")
    @Test fun identifiesOneExactOpenRoll() {
        val p=FilmRollDecision.propose("site","s115",BigDecimal("3.25"),listOf(roll))!!
        assertEquals("6.75",p.remaining.toPlainString())
        assertEquals("0",FilmRollDecision.propose("site","s115",BigDecimal("10"),listOf(roll))!!.remaining.toPlainString())
    }
    @Test fun refusesAmbiguousUnrelatedOrExcessUsage() {
        val used=BigDecimal("3")
        assertNull(FilmRollDecision.propose("site","S115",used,listOf(roll,roll.copy(rollId="other"))))
        assertNull(FilmRollDecision.propose("other","S115",used,listOf(roll)))
        assertNull(FilmRollDecision.propose("site","S115",used,listOf(roll.copy(returned=true))))
        assertNull(FilmRollDecision.propose("site","S115",BigDecimal("11"),listOf(roll)))
        assertNull(FilmRollDecision.propose("site","S115",BigDecimal.ZERO,listOf(roll)))
    }
}
