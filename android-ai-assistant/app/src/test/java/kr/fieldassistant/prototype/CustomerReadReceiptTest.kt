package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class CustomerReadReceiptTest {
    @Test fun onlyVisibleNewMessagesAreAcknowledged() {
        val receipt = CustomerReadReceipt()
        assertNull(receipt.visible("", true))
        assertNull(receipt.visible("first", false))
        assertEquals("first", receipt.visible("first", true))
        assertNull(receipt.visible("first", true))
        assertNull(receipt.visible("second", false))
        assertNull(receipt.visible("second", true))
        receipt.completed("first")
        assertNull(receipt.visible("first", true))
        assertEquals("second", receipt.visible("second", true))
    }

    @Test fun failuresCanBeRetriedWithoutUndoingANewerReceipt() {
        val receipt = CustomerReadReceipt()
        assertEquals("first", receipt.visible("first", true))
        receipt.failed("first")
        assertEquals("first", receipt.visible("first", true))
        receipt.completed("first")
        assertEquals("second", receipt.visible("second", true))
        receipt.failed("first")
        assertNull(receipt.visible("second", true))
        receipt.failed("second")
        assertEquals("second", receipt.visible("second", true))
    }
}
