package kr.fieldassistant.prototype

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

internal object OAuthProof {
    fun random():String=Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also { SecureRandom().nextBytes(it) })
    fun challenge(verifier:String):String=Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
    fun validState(expected:String,actual:String,created:Long,now:Long):Boolean =
        Regex("[A-Za-z0-9_-]{43}").matches(expected) && now-created in 0..600000 &&
        MessageDigest.isEqual(expected.toByteArray(Charsets.US_ASCII),actual.toByteArray(Charsets.US_ASCII))
}
