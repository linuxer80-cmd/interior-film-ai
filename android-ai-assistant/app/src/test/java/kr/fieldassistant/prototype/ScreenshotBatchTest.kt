package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest
import java.util.UUID

class ScreenshotBatchTest {
    @Test fun perImageBudgetFitsServerLimit() {
        for(count in 1..5) {
            val limit=ScreenshotBatch.maxBytesPerImage(count)
            assertTrue(ScreenshotBatch.withinLimits(List(count) { ByteArray(limit) }))
        }
        assertThrows(IllegalArgumentException::class.java) { ScreenshotBatch.maxBytesPerImage(0) }
        assertThrows(IllegalArgumentException::class.java) { ScreenshotBatch.maxBytesPerImage(6) }
    }
    @Test fun limitsNumberAndTotalSize() {
        assertFalse(ScreenshotBatch.withinLimits(emptyList()))
        assertTrue(ScreenshotBatch.withinLimits(List(5) { byteArrayOf(1) }))
        assertFalse(ScreenshotBatch.withinLimits(List(6) { byteArrayOf(1) }))
        assertFalse(ScreenshotBatch.withinLimits(listOf(byteArrayOf())))
        assertTrue(ScreenshotBatch.withinLimits(listOf(ByteArray(3_500_000))))
        assertFalse(ScreenshotBatch.withinLimits(listOf(ByteArray(3_500_001))))
    }
    @Test fun keyIsStableScopedAndPreservesPhotoOrder() {
        val a=byteArrayOf(1);val b=byteArrayOf(2)
        val key=ScreenshotBatch.requestKey("user","company",listOf(a,b))
        assertEquals(key,ScreenshotBatch.requestKey("user","company",listOf(a,b)))
        assertNotEquals(key,ScreenshotBatch.requestKey("user","company",listOf(b,a)))
        assertNotEquals(key,ScreenshotBatch.requestKey("user","other",listOf(a,b)))
        val old="site_photo_request_"+UUID.nameUUIDFromBytes("user:company:".toByteArray()+MessageDigest.getInstance("SHA-256").digest(a))
        assertEquals(old,ScreenshotBatch.requestKey("user","company",listOf(a)))
    }
}
