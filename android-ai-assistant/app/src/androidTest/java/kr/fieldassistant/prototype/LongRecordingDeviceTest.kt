package kr.fieldassistant.prototype

import android.net.Uri
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

class LongRecordingDeviceTest {
    @Test fun canSeekPastFifteenMinutesAndReadTheFinalSegment() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val file=File(context.cacheDir,"long-recording-test.wav")
        val rate=16000;val seconds=16*60+20;val dataBytes=rate*seconds*2
        try {
            RandomAccessFile(file,"rw").use { out ->
                out.setLength(44L+dataBytes)
                val h=ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
                h.put("RIFF".toByteArray()).putInt(36+dataBytes).put("WAVEfmt ".toByteArray()).putInt(16)
                    .putShort(1).putShort(1).putInt(rate).putInt(rate*2).putShort(2).putShort(16)
                    .put("data".toByteArray()).putInt(dataBytes)
                out.seek(0);out.write(h.array());out.seek(44L+905L*rate*2)
                val pulse=ByteBuffer.allocate(rate/5*2).order(ByteOrder.LITTLE_ENDIAN)
                repeat(rate/5) { pulse.putShort(20000) };out.write(pulse.array())
            }
            var peak=0;var count=0L
            val more=OfflineAudio.decodeChunk(context,Uri.fromFile(file),900_000_000L,{false}) { samples ->
                count+=samples.size;for(v in samples) peak=maxOf(peak,abs(v.toInt()))
            }
            assertTrue(more);assertTrue("late audio marker was not decoded",peak>15000)
            assertTrue("the window should cover about 61 seconds",count in (59L*rate)..(63L*rate))
            var tail=0L
            assertFalse(OfflineAudio.decodeChunk(context,Uri.fromFile(file),960_000_000L,{false}) { tail+=it.size })
            assertTrue("the final 20 seconds were not decoded",tail in (19L*rate)..(23L*rate))
        } finally { file.delete() }
    }
}
