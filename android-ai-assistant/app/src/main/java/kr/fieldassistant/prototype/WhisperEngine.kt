package kr.fieldassistant.prototype

import org.json.JSONObject
import java.io.Closeable
import java.io.ByteArrayOutputStream

internal object WhisperNative {
    init { System.loadLibrary("field_whisper") }
    external fun open(path: String): Long
    external fun close(handle: Long)
    external fun transcribe(handle: Long,audio: FloatArray): String
}
internal class WhisperModel(path: String): Closeable {
    val handle=WhisperNative.open(path)
    override fun close() { WhisperNative.close(handle) }
}
/** Holds at most the caller's 15-minute limit; Whisper segments the entire call. */
internal class WhisperRecognizer(private val model: WhisperModel,rate: Float): Closeable {
    private val pcm=ByteArrayOutputStream()
    init { require(rate==16000f) }
    fun acceptWaveForm(samples: ShortArray,size: Int): Boolean {
        require(size in 0..samples.size)
        check(pcm.size()+size*2<=16000*60*15*2+65536) { "녹음이 너무 깁니다." }
        for(i in 0 until size) { val v=samples[i].toInt();pcm.write(v and 255);pcm.write((v shr 8) and 255) }
        return false
    }
    val result: String get()="{}"
    val finalResult: String get() {
        val bytes=pcm.toByteArray();pcm.reset()
        val samples=FloatArray(bytes.size/2) { i ->
            (((bytes[i*2].toInt() and 255) or (bytes[i*2+1].toInt() shl 8)).toShort().toInt()/32768f)
        }
        return JSONObject().put("text",WhisperNative.transcribe(model.handle,samples)).toString()
    }
    override fun close() { pcm.close() }
}
