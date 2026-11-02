package kr.fieldassistant.prototype

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.nio.ByteOrder
import java.util.zip.ZipInputStream
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
    private val quoteWords=listOf("견적","견젹","견젨","견적서")
    private val prices=listOf("얼마","비용","가격","금액","단가","값")
    private val work=listOf("시공","공사","인테리어","인테리","필름","시트지","도배","벽지","도장","페인트","마루","타일","전기","조명","배관","수도","설치","교체","수리","철거","목공","창문","문짝","방문","싱크대","싱크","욕실","화장실","보수","리모델링")
    fun likely(text: String): Boolean {
        val normalized=text.replace(Regex("\\s+"),"")
        return quoteWords.any(normalized::contains) || (prices.any(normalized::contains) && work.any(normalized::contains))
    }
}

internal object OfflineModel {
    fun ensure(context: Context): File {
        val destination=File(context.filesDir,"vosk-korean-0.22")
        if(File(destination,".complete").isFile && File(destination,"am/final.mdl").isFile) return destination
        val tmp=File(context.filesDir,"vosk-korean-0.22.tmp")
        tmp.deleteRecursively();check(tmp.mkdirs())
        var total=0L
        try {
            ZipInputStream(context.assets.open("vosk-ko.zip").buffered()).use { zip ->
                while(true) {
                    val entry=zip.nextEntry ?: break
                    val prefix="vosk-model-small-ko-0.22/"
                    if(!entry.name.startsWith(prefix)) { zip.closeEntry();continue }
                    val relative=entry.name.removePrefix(prefix)
                    if(relative.isBlank()) { zip.closeEntry();continue }
                    val target=File(tmp,relative)
                    val base=tmp.canonicalPath+File.separator
                    require(target.canonicalPath.startsWith(base)) { "잘못된 모델 파일 경로" }
                    if(entry.isDirectory) target.mkdirs() else {
                        target.parentFile?.mkdirs()
                        target.outputStream().buffered().use { out ->
                            val block=ByteArray(32768)
                            while(true) { val n=zip.read(block);if(n<0)break;total+=n;check(total<=600L*1024*1024);out.write(block,0,n) }
                        }
                    }
                    zip.closeEntry()
                }
            }
            check(File(tmp,"am/final.mdl").isFile && File(tmp,"conf/model.conf").isFile) { "음성 모델 파일이 완전하지 않습니다." }
            File(tmp,".complete").writeText("0.22")
            if(destination.exists()) check(destination.deleteRecursively())
            check(tmp.renameTo(destination)) { "음성 모델을 저장하지 못했습니다." }
            return destination
        } catch(e: Exception) { tmp.deleteRecursively();throw e }
    }
}

data class OfflineTranscript(val text: String, val truncated: Boolean)

/** Android decodes the recording locally; Vosk receives 16-kHz mono PCM. */
internal object OfflineAudio {
    private const val MAX_DURATION_US=15L*60*1_000_000
    fun transcribe(context: Context, uri: Uri, model: Model, cancelled: () -> Boolean): OfflineTranscript {
        val extractor=MediaExtractor()
        var codec: MediaCodec?=null
        try {
            extractor.setDataSource(context,uri,null)
            val track=(0 until extractor.trackCount).firstOrNull { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/")==true }
                ?: error("지원되는 음성 트랙이 없습니다.")
            val format=extractor.getTrackFormat(track); val mime=format.getString(MediaFormat.KEY_MIME) ?: error("오디오 형식을 확인할 수 없습니다.")
            android.util.Log.i("AssistantTest","CODEC inputFormat="+format)
            val duration=if(format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
            val truncated=duration>MAX_DURATION_US
            extractor.selectTrack(track)
            val decoder=MediaCodec.createDecoderByType(mime);codec=decoder;decoder.configure(format,null,null,0);decoder.start()
            var channels=if(format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) else 1
            var sampleRate=if(format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) format.getInteger(MediaFormat.KEY_SAMPLE_RATE) else 16000
            var encoding=AudioFormat.ENCODING_PCM_16BIT;var resampler=StreamingResampler(sampleRate)
            val output=StringBuilder();val info=MediaCodec.BufferInfo();var inputDone=false;var outputDone=false
            var inputs=0;var outputs=0;var totalFrames=0;var maxAmplitude=0
            Recognizer(model,16000f).use { recognizer ->
                var idle=0
                while(!outputDone) {
                    if(cancelled()) throw InterruptedException("작업이 중단되었습니다.")
                    var progressed=false
                    if(!inputDone) {
                        val index=decoder.dequeueInputBuffer(10000)
                        if(index>=0) {
                            val input=decoder.getInputBuffer(index) ?: error("입력 버퍼를 확인하지 못했습니다.")
                            val time=extractor.sampleTime
                            val size=if(time<0 || time>MAX_DURATION_US) -1 else extractor.readSampleData(input,0)
                            if(inputs++<4) android.util.Log.i("AssistantTest","CODEC input time="+time+" size="+size)
                            if(size<0) { decoder.queueInputBuffer(index,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputDone=true }
                            else { decoder.queueInputBuffer(index,0,size,time,0);extractor.advance() }
                            progressed=true
                        }
                    }
                    when(val index=decoder.dequeueOutputBuffer(info,10000)) {
                        MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                            val outputFormat=decoder.outputFormat
                            val nextRate=if(outputFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE) else sampleRate
                            if(nextRate!=sampleRate) { sampleRate=nextRate;resampler=StreamingResampler(sampleRate) }
                            channels=if(outputFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) else channels
                            android.util.Log.i("AssistantTest","CODEC outputFormat="+outputFormat)
                            encoding=if(outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
                            require(channels in 1..8);progressed=true
                        }
                        in 0..Int.MAX_VALUE -> {
                            if(outputs++<4) android.util.Log.i("AssistantTest","CODEC out size="+info.size+" flags="+info.flags+" offset="+info.offset)
                            if(info.size>0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG==0) {
                                val buffer=decoder.getOutputBuffer(index) ?: error("출력 버퍼를 확인하지 못했습니다.")
                                buffer.position(info.offset);buffer.limit(info.offset+info.size)
                                val pcm=buffer.slice().order(ByteOrder.LITTLE_ENDIAN)
                                val bytesPerSample=if(encoding==AudioFormat.ENCODING_PCM_FLOAT) 4 else 2
                                require(encoding==AudioFormat.ENCODING_PCM_FLOAT || encoding==AudioFormat.ENCODING_PCM_16BIT)
                                val frames=pcm.remaining()/(bytesPerSample*channels);val mono=ShortArray(frames)
                                for(frame in 0 until frames) {
                                    var sum=0.0
                                    repeat(channels) { sum+=if(encoding==AudioFormat.ENCODING_PCM_FLOAT) (pcm.float.coerceIn(-1f,1f)*32767f).toDouble() else pcm.short.toDouble() }
                                    mono[frame]=(sum/channels).roundToInt().coerceIn(-32768,32767).toShort()
                                }
                                totalFrames+=frames;maxAmplitude=maxOf(maxAmplitude,mono.maxOfOrNull { kotlin.math.abs(it.toInt()) } ?: 0)
                                val samples=resampler.convert(mono)
                                if(samples.isNotEmpty() && recognizer.acceptWaveForm(samples,samples.size)) appendRecognized(output,recognizer.result)
                            }
                            if(info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM!=0) outputDone=true
                            decoder.releaseOutputBuffer(index,false);progressed=true
                        }
                    }
                    if(progressed) idle=0 else if(++idle>1000) error("오디오 분석 시간이 초과됐습니다.")
                }
                val finalJson=recognizer.finalResult
                android.util.Log.i("AssistantTest","CODEC inputs="+inputs+" outputs="+outputs+" totalFrames="+totalFrames+" maxAmplitude="+maxAmplitude+" final="+finalJson)
                appendRecognized(output,finalJson)
            }
            return OfflineTranscript(output.toString().trim().take(30000),truncated)
        } finally { try { codec?.stop() } catch(_: Exception) {} ;codec?.release();extractor.release() }
    }
    private fun appendRecognized(out: StringBuilder,json: String) {
        val value=JSONObject(json).optString("text").trim()
        if(value.isNotBlank() && out.length<30000) { if(out.isNotEmpty()) out.append(' ');out.append(value.take(30000-out.length)) }
    }
}
