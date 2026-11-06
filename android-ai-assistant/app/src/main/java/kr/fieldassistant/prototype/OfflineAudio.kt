package kr.fieldassistant.prototype

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import org.json.JSONObject
import kr.fieldassistant.prototype.WhisperModel as Model
import kr.fieldassistant.prototype.WhisperRecognizer as Recognizer
import java.io.File
import java.nio.ByteOrder
import java.security.MessageDigest
import kotlin.math.floor
import kotlin.math.roundToInt

/** Maintains interpolation state across decoder output buffers. */
internal class StreamingResampler(private val inputRate: Int, private val outputRate: Int = 16000) {
    private var previous: Short? = null
    private var cursor = 0.0
    init { require(inputRate in 4000..192000 && outputRate > 0) }
    fun convert(input: ShortArray): ShortArray {
        if(input.isEmpty()) return ShortArray(0)
        val prior=previous
        val samples=if(prior==null) input else ShortArray(input.size+1).also { it[0]=prior;input.copyInto(it,1) }
        previous=samples.last()
        if(samples.size<2) return ShortArray(0)
        val step=inputRate.toDouble()/outputRate
        val result=ArrayList<Short>()
        while(cursor < samples.size-1) {
            val i=floor(cursor).toInt();val t=cursor-i
            val value=samples[i]*(1.0-t)+samples[i+1]*t
            result.add(value.roundToInt().coerceIn(-32768,32767).toShort());cursor+=step
        }
        cursor-=samples.size-1
        return result.toShortArray()
    }
}

internal object InquiryMatcher {
    private val quoteWords=listOf("견적","견젹","견젨","견적서","인테리어","필름","시트지","문의")
    private val prices=listOf("얼마","비용","가격","금액","단가","값")
    private val work=listOf("시공","공사","인테리어","인테리","필름","시트지","도배","벽지","도장","페인트","마루","타일","전기","조명","배관","수도","설치","교체","수리","철거","목공","창문","문짝","방문","싱크대","싱크","욕실","화장실","보수","리모델링")
    fun likely(text: String): Boolean {
        val normalized=text.replace(Regex("\\s+"),"")
        return quoteWords.any(normalized::contains) || normalized.contains("시공") || (prices.any(normalized::contains) && work.any(normalized::contains))
    }
}

internal object OfflineModel {
    @Synchronized fun ensure(context: Context): File {
        val name="ggml-small-q5_1.bin"
        val destination=File(context.filesDir,name)
        val expected=context.assets.open("whisper-model.sha256").bufferedReader().use { it.readText().trim().split(" ").first() }
        val marker=File(context.filesDir,"whisper-small-q5.complete")
        if(destination.isFile && marker.isFile && marker.readText()==expected && destination.length()>100_000_000L) return destination
        val tmp=File(context.filesDir,"$name.tmp")
        try {
            val digest=MessageDigest.getInstance("SHA-256")
            context.assets.open(name).use { input -> tmp.outputStream().buffered().use { out ->
                val block=ByteArray(65536)
                while(true) { val n=input.read(block);if(n<0)break;out.write(block,0,n);digest.update(block,0,n) }
            } }
            val actual=digest.digest().joinToString("") { "%02x".format(it) }
            check(actual==expected) { "음성 모델 파일 검증에 실패했습니다." }
            if(destination.exists()) check(destination.delete())
            check(tmp.renameTo(destination))
            marker.writeText(expected)
            return destination
        } catch(e: Exception) { tmp.delete();throw e }
    }
}

data class OfflineTranscript(val text:String,val truncated:Boolean)
internal data class OfflineChunk(val text:String,val hasMore:Boolean)

/** Decode bounded, overlapping time windows and checkpoint each completed window. */
internal object OfflineAudio {
    fun transcribe(context:Context,uri:Uri,model:Model,cancelled:()->Boolean):OfflineTranscript {
        var progress=RecordingProgress(-1,-1)
        while(true) {
            if(cancelled()) throw InterruptedException("작업이 중단되었습니다.")
            val chunk=transcribeChunk(context,uri,model,progress.nextUs,cancelled)
            progress=progress.add(chunk.text)
            if(!chunk.hasMore) return OfflineTranscript(progress.display(),progress.compacted)
        }
    }
    fun transcribeChunk(context:Context,uri:Uri,model:Model,startUs:Long,cancelled:()->Boolean):OfflineChunk {
        Recognizer(model,16000f).use { recognizer ->
            val more=decodeChunk(context,uri,startUs,cancelled) { samples ->
                if(samples.isNotEmpty()) recognizer.acceptWaveForm(samples,samples.size)
            }
            if(cancelled()) throw InterruptedException("작업이 중단되었습니다.")
            val text=JSONObject(recognizer.finalResult).optString("text").trim()
            if(cancelled()) throw InterruptedException("작업이 중단되었습니다.")
            return OfflineChunk(text,more)
        }
    }
    /** Returns true only when another encoded sample exists at or after the window. */
    fun decodeChunk(context:Context,uri:Uri,startUs:Long,cancelled:()->Boolean,onSamples:(ShortArray)->Unit):Boolean {
        require(startUs>=0 && startUs<=Long.MAX_VALUE-OfflineChunkPolicy.LENGTH_US)
        val lower=maxOf(0L,startUs-OfflineChunkPolicy.OVERLAP_US);val upper=startUs+OfflineChunkPolicy.LENGTH_US
        val extractor=MediaExtractor();var codec:MediaCodec?=null
        try {
            extractor.setDataSource(context,uri,null)
            val track=(0 until extractor.trackCount).firstOrNull { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/")==true }
                ?: error("지원되는 음성 트랙이 없습니다.")
            val format=extractor.getTrackFormat(track);val mime=format.getString(MediaFormat.KEY_MIME) ?: error("오디오 형식을 확인할 수 없습니다.")
            val duration=if(format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
            extractor.selectTrack(track)
            if(startUs>0) {
                extractor.seekTo(lower,MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
                val actual=extractor.sampleTime
                check(actual>=maxOf(0L,lower-10_000_000L) && actual<=startUs+1_000_000L) { "녹음의 이어 분석 위치를 확인하지 못했습니다." }
            }
            val decoder=MediaCodec.createDecoderByType(mime);codec=decoder;decoder.configure(format,null,null,0);decoder.start()
            var channels=if(format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) else 1
            var rate=if(format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) format.getInteger(MediaFormat.KEY_SAMPLE_RATE) else 16000
            var encoding=AudioFormat.ENCODING_PCM_16BIT;var resampler=StreamingResampler(rate)
            val info=MediaCodec.BufferInfo();var inputDone=false;var outputDone=false;var more=false;var idle=0;var emitted=0L;var queuedAudio=false
            while(!outputDone) {
                if(cancelled()) throw InterruptedException("작업이 중단되었습니다.")
                var progressed=false
                if(!inputDone) {
                    val index=decoder.dequeueInputBuffer(10000)
                    if(index>=0) {
                        val input=decoder.getInputBuffer(index) ?: error("입력 버퍼를 확인하지 못했습니다.")
                        val time=extractor.sampleTime
                        val atBoundary=time>=upper && time>=0
                        val size=if(atBoundary) -1 else extractor.readSampleData(input,0)
                        if(size<0) { more=atBoundary;decoder.queueInputBuffer(index,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputDone=true }
                        else { if(size>0) queuedAudio=true;decoder.queueInputBuffer(index,0,size,time,0);extractor.advance() }
                        progressed=true
                    }
                }
                when(val index=decoder.dequeueOutputBuffer(info,10000)) {
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        val outputFormat=decoder.outputFormat
                        val nextRate=if(outputFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE) else rate
                        if(nextRate!=rate) { rate=nextRate;resampler=StreamingResampler(rate) }
                        channels=if(outputFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) else channels
                        encoding=if(outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
                        require(channels in 1..8);progressed=true
                    }
                    in 0..Int.MAX_VALUE -> {
                        if(info.size>0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG==0) {
                            val buffer=decoder.getOutputBuffer(index) ?: error("출력 버퍼를 확인하지 못했습니다.")
                            buffer.position(info.offset);buffer.limit(info.offset+info.size)
                            val pcm=buffer.slice().order(ByteOrder.LITTLE_ENDIAN)
                            val bytes=if(encoding==AudioFormat.ENCODING_PCM_FLOAT) 4 else 2
                            require(encoding==AudioFormat.ENCODING_PCM_FLOAT || encoding==AudioFormat.ENCODING_PCM_16BIT)
                            val frames=pcm.remaining()/(bytes*channels);val pts=info.presentationTimeUs
                            fun frameAt(t:Long):Int = if(t<=pts) 0 else (((t-pts)*rate+999_999L)/1_000_000L).coerceIn(0L,frames.toLong()).toInt()
                            val first=frameAt(lower);val last=frameAt(upper);val mono=ShortArray(maxOf(0,last-first))
                            for(frame in 0 until frames) {
                                var sum=0.0
                                repeat(channels) { sum+=if(encoding==AudioFormat.ENCODING_PCM_FLOAT) (pcm.float.coerceIn(-1f,1f)*32767f).toDouble() else pcm.short.toDouble() }
                                if(frame in first until last) mono[frame-first]=(sum/channels).roundToInt().coerceIn(-32768,32767).toShort()
                            }
                            val samples=resampler.convert(mono);emitted+=samples.size
                            check(emitted<=16000L*63L) { "녹음의 시간 정보를 확인하지 못했습니다." }
                            if(samples.isNotEmpty()) onSamples(samples)
                        }
                        if(info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM!=0) outputDone=true
                        decoder.releaseOutputBuffer(index,false);progressed=true
                    }
                }
                if(progressed) idle=0 else if(++idle>1000) error("오디오 분석 시간이 초과됐습니다.")
            }
            if(cancelled()) throw InterruptedException("작업이 중단되었습니다.")
            check(!queuedAudio || emitted>0) { "녹음의 해당 구간을 읽지 못했습니다." }
            val expectedUs=if(more) upper-lower else if(duration>lower) minOf(duration,upper)-lower else 0L
            if(expectedUs>3_000_000L) check(emitted >= (expectedUs-3_000_000L)*16000L/1_000_000L) { "녹음의 일부를 읽지 못했습니다. 파일을 다시 확인해 주세요." }
            return more
        } finally { try { codec?.stop() } catch(_:Exception) {} ;codec?.release();extractor.release() }
    }
}
