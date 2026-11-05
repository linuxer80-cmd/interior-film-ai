package kr.fieldassistant.prototype

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.URI
import javax.net.ssl.HttpsURLConnection

/** Reject unsafe destinations before opening a connection or attaching credentials. */
internal object SecureTransport {
    fun requireHttps(raw: String): String {
        val uri = try { URI(raw).parseServerAuthority() } catch (_: Exception) {
            throw IllegalArgumentException("보안 연결 주소가 올바르지 않습니다.")
        }
        require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank() &&
            uri.rawUserInfo == null && uri.rawFragment == null &&
            (uri.port == -1 || uri.port in 1..65535)) { "HTTPS 보안 연결만 사용할 수 있습니다." }
        return raw
    }

    fun isHttps(raw: String): Boolean = try { requireHttps(raw); true } catch (_: Exception) { false }

    fun open(raw: String): HttpsURLConnection =
        (URI(requireHttps(raw)).toURL().openConnection() as HttpsURLConnection).apply {
            // No automatic redirects: neither HTTP downgrade nor credential forwarding.
            instanceFollowRedirects = false
            connectTimeout = 15000
            readTimeout = 30000
            useCaches = false
            // Keep Android's certificate chain and hostname validation unchanged.
        }

    fun readBounded(input: InputStream, limit: Int): ByteArray {
        require(limit > 0)
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count == -1) break
            check(count <= limit - output.size()) { "파일 크기 제한을 초과했습니다." }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
}
