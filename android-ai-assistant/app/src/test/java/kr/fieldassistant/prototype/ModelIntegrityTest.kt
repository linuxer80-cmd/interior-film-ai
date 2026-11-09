package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class ModelIntegrityTest {
    private val input="abc".toByteArray()
    private val hash="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    @Test fun copiesOnlyWhenSizeAndHashMatch() {
        val output=ByteArrayOutputStream()
        ModelIntegrity.copyVerified(ByteArrayInputStream(input),output,3,hash)
        assertArrayEquals(input,output.toByteArray())
    }
    @Test fun rejectsTruncationExcessAndCorruption() {
        for((size,digest) in listOf(4L to hash,2L to hash,3L to "0".repeat(64))) {
            assertTrue(runCatching { ModelIntegrity.copyVerified(ByteArrayInputStream(input),ByteArrayOutputStream(),size,digest) }.isFailure)
        }
    }
    @Test fun cancellationStopsBeforePublishing() {
        assertTrue(runCatching { ModelIntegrity.copyVerified(ByteArrayInputStream(input),ByteArrayOutputStream(),3,hash) { true } }.exceptionOrNull() is InterruptedException)
    }
}
