package kr.fieldassistant.prototype

import java.security.MessageDigest
import java.util.UUID

internal object ScreenshotBatch {
    private const val MAX_TOTAL_BYTES = 3_500_000
    fun maxBytesPerImage(count:Int):Int {
        require(count in 1..5) { "사진은 1장부터 5장까지 선택해 주세요." }
        return MAX_TOTAL_BYTES/count
    }
    fun withinLimits(images:List<ByteArray>):Boolean = images.size in 1..5 &&
        images.all { it.isNotEmpty() } && images.sumOf { it.size.toLong() } <= MAX_TOTAL_BYTES.toLong()

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
