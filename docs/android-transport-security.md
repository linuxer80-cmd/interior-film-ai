# Android transport security — 20039

Scope: `kr.fieldassistant.prototype.stable`, based on the exact source of build
20038 (`5faef4d436e2ff056ab28b9b170ccc9159bee563`, successful Actions run
41750761579). This change does not alter the production web application's main
branch, Google Play declarations, or production release status.

## Existing protections verified in source

- API requests used HTTPS, Android disallowed cleartext traffic, and the main
  WebView rejected mixed content and invalid certificates.
- Native login sessions and pending OAuth values use Android Keystore AES-GCM;
  native credentials are not injected into WebView JavaScript or URLs.
- Native Whisper inference has no network transport in the app's JNI adapter.

## Additional enforcement

- A packaged Network Security Configuration explicitly denies cleartext for all
  domains and trusts system certificate authorities only, without a debug bypass.
- `SecureTransport` validates HTTPS destinations before opening any of the 27
  native request connections. It rejects URL credentials, invalid ports and
  fragments, disables redirects and response caching, and retains Android's
  certificate-chain and hostname verification. No custom encryption algorithm,
  trust-all certificate manager or hostname bypass is introduced.
- Supabase Auth/Postgrest's Ktor client validates each outgoing URL and disables
  redirects before authentication or business data can follow another location.
- The main and popup WebViews block HTTP resources and cancel certificate errors.
  Plain HTTP links are no longer handed to an external browser.
- File downloads use the app's HTTPS connection, with no automatic redirects or
  cross-origin cookie forwarding, followed by the Android save dialog. Downloads
  are limited to 20 MiB, matching the existing in-app blob download limit. An HTTP
  or redirect-only download fails closed and must be served from its final HTTPS
  URL. Telephone/map/email actions remain explicit external app actions.

## Verification

- JVM regression tests cover HTTP/other schemes, malformed URLs, embedded
  credentials, secure signed URLs, no-redirect/no-cache configuration and bounded
  file reads.
- Android 16 device tests verify that neither the platform nor the SDK sends an
  HTTP request to a listening local server; native and SDK connections reject a
  freshly generated untrusted TLS certificate; the public production privacy page
  remains reachable using certificate-verified HTTPS.
- CI runs all existing JVM tests, compiles debug/release bundles and the device
  tests, launches the app, and executes the four transport device tests. A test
  certificate is generated only for androidTest and is never a release trust root.

## Release boundary

The generated release AAB still requires the existing upload signing identity.
Keep the installed package and signing identity; do not use the CI debug APK to
replace a production installation. Google Play's encryption answer describes all
distributed versions, SDKs and associated app traffic, not just this source
change. The data collection/retention/sharing answers require separate review.

Primary references checked 2026-11-05:
- https://developer.android.com/privacy-and-security/security-config
- https://developer.android.com/reference/android/webkit/SslErrorHandler
- https://ktor.io/docs/client-ssl.html
- https://api.ktor.io/3.0.x/ktor-client-core/io.ktor.client/-http-client-config/follow-redirects.html
- https://support.google.com/googleplay/android-developer/answer/10787469
