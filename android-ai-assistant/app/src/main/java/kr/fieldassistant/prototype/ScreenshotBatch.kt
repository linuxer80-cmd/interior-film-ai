package kr.fieldassistant.prototype

import java.security.MessageDigest
import java.util.UUID

internal object ScreenshotBatch {
    fun withinLimits(images:List<ByteArray>):Boolean = images.size in 1..5 &&
        images.all { it.isNotEmpty() } && images.sumOf { it.size.toLong() } <= 3_500_000L

    fun requestKey(user:String,company:String,images:List<ByteArray>):String {
        require(withinLimits(images))
        val prefix=(user+":"+company+":").toByteArray(Charsets.UTF_8)
        // Preserve the previous single-photo key so interrupted retries remain safe.
        val digest=if(images.size==1) MessageDigest.getInstance("SHA-256").digest(images.single()) else {
            val md=MessageDigest.getInstance("SHA-256")
            images.forEach { image ->
                md.update(java.nio.ByteBuffer.allocate(4).putInt(image.size).array())
                md.update(image)
            }
            md.digest()
        }
        return "site_photo_request_"+UUID.nameUUIDFromBytes(prefix+digest).toString()
    }
}
