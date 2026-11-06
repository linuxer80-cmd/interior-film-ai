package kr.fieldassistant.prototype

import io.ktor.client.HttpClientConfig
import io.ktor.client.plugins.api.createClientPlugin

private val HttpsOnly = createClientPlugin("FieldAssistantHttpsOnly") {
    onRequest { request, _ -> SecureTransport.requireSecureRequest(request.url.buildString()) }
}

/** Shared by the Supabase auth/database client and its device transport tests. */
internal fun HttpClientConfig<*>.requireEncryptedTransport() {
    followRedirects = false
    install(HttpsOnly)
}
