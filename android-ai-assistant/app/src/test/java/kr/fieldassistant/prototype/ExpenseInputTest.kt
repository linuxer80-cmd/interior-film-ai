package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class ExpenseInputTest {
    @Test fun acceptsExplicitCategorizedAmounts() {
        assertEquals(5000L,ExpenseInput.parse("주차비 5,000원")?.amount)
        assertEquals(20000L,ExpenseInput.parse("주유 2만원")?.amount)
        assertEquals("meal",ExpenseInput.parse("식비 12000원")?.type)
    }
    @Test fun rejectsAmbiguousAndOutOfRangeAmounts() {
        assertEquals(5000L,ExpenseInput.parse("주차비 오천원")?.amount)
        assertEquals(5000L,ExpenseInput.parse("주차비 5천원")?.amount)
        assertNull(ExpenseInput.parse("주차비 만오천원"))
        assertNull(ExpenseInput.parse("주차비 1000원 또는 2000원"))
        assertNull(ExpenseInput.parse("주차비 0원"))
        assertNull(ExpenseInput.parse("주차비 100000001원"))
        assertNull(ExpenseInput.parse("경비 5000원"))
        assertNull(ExpenseInput.parse("주차비 5000원 등록하지마"))
        assertNull(ExpenseInput.parse("주차비 5000원 저장 안 해"))
        assertNull(ExpenseInput.parse("주차비 말고 식비 5000원"))
        assertNull(ExpenseInput.parse("주차비 식비 합해서 5000원"))
    }
}
