package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test
import java.math.BigDecimal

class ReportMaterialInputTest {
    @Test fun explicitZeroAndFractionalLengthsAreAccepted() {
        assertEquals(BigDecimal.ZERO,ReportMaterialInput.number("0"))
        assertEquals(BigDecimal("12.345"),ReportMaterialInput.number("12.345"))
        assertEquals(BigDecimal("1000000"),ReportMaterialInput.number("1000000"))
    }
    @Test fun missingNegativeOverpreciseAndExcessiveValuesAreRejected() {
        listOf("", "-1", "0.0001", "1000001", "1e2", ".2", "1,2", "NaN").forEach { assertNull(it,ReportMaterialInput.number(it)) }
    }
}
