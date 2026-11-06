package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class SecureTransportTest {
    @Test fun websocketRequestsRequireSecureWssAndValidAuthority() {
        val good="wss://example.com/realtime/v1/websocket?apikey=public"
        assertEquals(good,SecureTransport.requireSecureRequest(good))
        for(url in listOf("ws://example.com/websocket","wss://user:secret@example.com/websocket","wss://example.com/#fragment","wss:///missing-host")) {
            try { SecureTransport.requireSecureRequest(url);fail("Accepted unsafe realtime URL") } catch(_:IllegalArgumentException) { }
        }
        assertFalse(SecureTransport.isHttps(good))
    }
    @Test fun rejectsUnsafeDestinationsBeforeConnecting() {
        val values = listOf("http://example.com", "ws://example.com", "file:///tmp/data", "//example.com",
            "https://user:secret@example.com", "https://example.com/#token", "https:///missing-host",
            "https://example.com:0", "https://example.com:65536", "https://example.com/\nheader", "https://example.com\\@evil.test")
        for (url in values) {
            assertFalse(url, SecureTransport.isHttps(url))
            try { SecureTransport.open(url); fail("Accepted unsafe destination") }
            catch (expected: IllegalArgumentException) { assertFalse(expected.message.orEmpty().contains("secret")) }
        }
    }
    @Test fun acceptsProductionAndEncodedSignedUrls() {
        for (url in listOf("https://interior-film-ai.vercel.app/api/site-expenses", "https://gxtvvzysuhexhpljpswj.supabase.co/auth/v1/token?grant_type=pkce",
            "https://example.com:443/file%20name?token=a%2Bb%3D")) assertEquals(url, SecureTransport.requireHttps(url))
    }
    @Test fun credentialsCannotFollowARedirect() {
        val connection = SecureTransport.open("https://example.com/")
        try {
            assertFalse(connection.instanceFollowRedirects)
            assertFalse(connection.useCaches)
            assertTrue(connection.connectTimeout > 0)
            assertTrue(connection.readTimeout > 0)
        } finally { connection.disconnect() }
    }
    @Test fun downloadLimitIsEnforcedForChunkedAndEmptyBodies() {
        assertArrayEquals(byteArrayOf(), SecureTransport.readBounded(byteArrayOf().inputStream(), 2))
        assertArrayEquals(byteArrayOf(1,2), SecureTransport.readBounded(byteArrayOf(1,2).inputStream(), 2))
        try { SecureTransport.readBounded(ByteArray(8193).inputStream(), 8192); fail("Oversized download accepted") }
        catch (_: IllegalStateException) { }
    }
}
