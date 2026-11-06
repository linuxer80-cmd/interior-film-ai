package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class ReceiptReturnMatchTest {
    @Test fun matchesKnownHyundaiCodeAndExplicitFireType() {
        assertTrue(ReceiptReturnMatch.matches("현대", "GS115", "non_fire", "현대보닥", "S115", "non_fire"))
        assertTrue(ReceiptReturnMatch.matches("현대", "FS115", "fire", "현대L&C", "S115", "fire"))
        assertFalse(ReceiptReturnMatch.matches("현대", "FS115", "non_fire", "현대", "S115", "non_fire"))
    }
    @Test fun neverConnectsDifferentBrandCodeOrUnknownType() {
        assertFalse(ReceiptReturnMatch.matches("영림","S115","non_fire","현대","S115","non_fire"))
        assertFalse(ReceiptReturnMatch.matches("현대","GSW115","non_fire","현대","S115","non_fire"))
        assertFalse(ReceiptReturnMatch.matches("현대","S115","unknown","현대","S115","non_fire"))
        assertFalse(ReceiptReturnMatch.matches("","S115","non_fire","현대","S115","non_fire"))
    }
    @Test fun matchesLxPrefixesWithoutMixingFire() {
        assertTrue(ReceiptReturnMatch.matches("LX", "RS115", "fire", "LX 베니프", "S115", "fire"))
        assertFalse(ReceiptReturnMatch.matches("LX", "RS115", "non_fire", "LX 베니프", "S115", "non_fire"))
    }
}
