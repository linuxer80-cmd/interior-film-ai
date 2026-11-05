package kr.fieldassistant.prototype

import android.security.NetworkSecurityPolicy
import androidx.test.platform.app.InstrumentationRegistry
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.request.get
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.net.URL
import java.security.KeyStore
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.SSLServerSocket
import kotlin.concurrent.thread

class TransportSecurityDeviceTest {
    @Test fun platformRejectsPlaintextBeforeSendingData() {
        assertFalse(NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted)
        ServerSocket(0).use { server ->
            server.soTimeout=400
            val connection=URL("http://127.0.0.1:${server.localPort}/must-not-send").openConnection()
            connection.connectTimeout=1000;connection.readTimeout=1000
            try { connection.getInputStream().close();fail("Plaintext allowed") }
            catch(e:java.io.IOException) { assertTrue(e.toString(),e.toString().contains("cleartext",true)) }
            try { server.accept().close();fail("Plaintext reached server") } catch(_:SocketTimeoutException) { }
        }
    }

    @Test fun sdkPolicyRejectsPlaintextBeforeSendingData() = runBlocking {
        ServerSocket(0).use { server ->
            server.soTimeout=400
            val client=HttpClient(Android) { requireEncryptedTransport() }
            try {
                try { client.get("http://127.0.0.1:${server.localPort}/must-not-send");fail("SDK plaintext allowed") }
                catch(_:IllegalArgumentException) { }
                try { server.accept().close();fail("SDK plaintext reached server") } catch(_:SocketTimeoutException) { }
            } finally { client.close() }
        }
    }

    @Test fun invalidCertificateIsRejectedByNativeAndSdkConnections() {
        for(useSdk in listOf(false,true)) {
            val context=InstrumentationRegistry.getInstrumentation().context
            val store=KeyStore.getInstance("PKCS12").apply {
                context.assets.open("untrusted-localhost.p12").use { load(it,"test-only".toCharArray()) }
            }
            val managers=KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(store,"test-only".toCharArray()) }
            val ssl=SSLContext.getInstance("TLS").apply { init(managers.keyManagers,null,null) }
            val server=ssl.serverSocketFactory.createServerSocket(0) as SSLServerSocket
            server.soTimeout=5000
            val receiver=thread {
                try { server.accept().use { socket -> socket.soTimeout=3000;socket.getInputStream().read() } } catch(_:Exception) { }
            }
            try {
                val url="https://localhost:${server.localPort}/"
                try {
                    if(useSdk) runBlocking {
                        val client=HttpClient(Android) { requireEncryptedTransport();engine { connectTimeout=3000;socketTimeout=3000 } }
                        try { client.get(url) } finally { client.close() }
                    } else {
                        val connection=SecureTransport.open(url)
                        try { connection.responseCode } finally { connection.disconnect() }
                    }
                    fail("Untrusted certificate accepted")
                } catch(e:Exception) {
                    assertTrue("Expected a TLS certificate failure, got ${e.javaClass.simpleName}",
                        generateSequence<Throwable>(e) { it.cause }.any { it is SSLException })
                }
            } finally { server.close();receiver.join(5000) }
        }
    }

    @Test fun validProductionHttpsStillWorks() {
        val connection=SecureTransport.open("https://interior-film-ai.vercel.app/support/legal/privacy")
        try { assertEquals(200,connection.responseCode);assertTrue(connection.cipherSuite.isNotBlank()) }
        finally { connection.disconnect() }
    }
}
