package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class DealerSetupInputTest {
    @Test fun normalizesDealerNamesForDuplicateWarning() {
        assertEquals(DealerSetupInput.normalizedName("  드림 아트 "),DealerSetupInput.normalizedName("드림아트"))
        assertEquals(DealerSetupInput.normalizedName("ABC"),DealerSetupInput.normalizedName(" aBc "))
    }
    @Test fun rejectsMissingNegativeAndExcessivePrices() {
        assertNull(DealerSetupInput.price(""));assertNull(DealerSetupInput.price("-1"));assertNull(DealerSetupInput.price("10000001"));assertNull(DealerSetupInput.price("NaN"))
        assertNotNull(DealerSetupInput.price("0"));assertNotNull(DealerSetupInput.price("7200.5"));assertNotNull(DealerSetupInput.price("10000000"))
    }
    @Test fun requiresExplicitFireClassification() {
        assertNull(DealerSetupInput.type(0));assertEquals("non_fire",DealerSetupInput.type(1));assertEquals("fire",DealerSetupInput.type(2));assertNull(DealerSetupInput.type(3))
    }
}
