package kr.fieldassistant.prototype

import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test

class PaymentValidationTest {
    private val today=LocalDate.of(2026,11,6)
    @Test fun initialAmountCanBeZeroButNewPaymentMustBePositive() {
        assertNull(PaymentValidation.validate("0","2026-11-06",false,null,null,today))
        assertNotNull(PaymentValidation.validate("0","2026-11-06",true,"2026-11-01",100,today))
        assertNotNull(PaymentValidation.validate("1.5","2026-11-06",false,null,null,today))
    }
    @Test fun paymentCannotExceedKnownBalanceOrDateBounds() {
        assertNotNull(PaymentValidation.validate("101","2026-11-06",true,"2026-11-01",100,today))
        assertNull(PaymentValidation.validate("100","2026-11-06",true,"2026-11-01",100,today))
        assertNotNull(PaymentValidation.validate("1","2026-11-07",true,"2026-11-01",100,today))
        assertNotNull(PaymentValidation.validate("1","2026-10-31",true,"2026-11-01",100,today))
        assertNotNull(PaymentValidation.validate("1","2026-11-06",true,null,100,today))
        assertNotNull(PaymentValidation.validate("1000000000001","2026-11-06",false,null,null,today))
    }
}
