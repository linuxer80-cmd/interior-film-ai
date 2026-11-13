package kr.fieldassistant.prototype

import org.junit.Assert.assertEquals
import org.junit.Test

class CallListOrderTest {
    @Test fun ordersKnownDatesFirstAndPreservesNewestAddedForUnknownDates() {
        assertEquals(listOf(2,0,3,1),CallListOrder.indicesNewestFirst(listOf(100L,0L,200L,-1L)))
        assertEquals(listOf(1,0),CallListOrder.indicesNewestFirst(listOf(100L,100L)))
        assertEquals(emptyList<Int>(),CallListOrder.indicesNewestFirst(emptyList()))
    }
}
