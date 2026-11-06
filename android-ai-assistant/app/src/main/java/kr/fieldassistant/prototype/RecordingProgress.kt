package kr.fieldassistant.prototype

import org.json.JSONObject

/** Checkpoint contains only locally stored speech text; it is never an upload request. */
internal data class RecordingProgress(
    val size:Long,val modified:Long,val nextUs:Long=0,val text:String="",val tail:String="",
    val match:String="",val likely:Boolean=false,val compacted:Boolean=false,val chunks:Int=0,
) {
    fun add(value:String):RecordingProgress {
        val speech=value.trim();val combined=listOf(text,speech).filter { it.isNotBlank() }.joinToString(" ")
        val found=InquiryMatcher.likely(listOf(tail,speech).joinToString(" "))
        val shorter=combined.length>24000
        val stored=if(shorter) combined.take(12000)+"\n…\n"+combined.takeLast(10000) else combined
        return copy(nextUs=nextUs+OfflineChunkPolicy.LENGTH_US,text=stored,tail=(tail+" "+speech).takeLast(200),
            match=if(match.isBlank() && found) speech.take(5000) else match,likely=likely||found,compacted=compacted||shorter,chunks=chunks+1)
    }
    fun display():String = if(compacted && match.isNotBlank() && !text.contains(match)) (text+"\n\n문의로 인식된 구간:\n"+match).take(30000) else text
    fun json()=JSONObject().put("size",size).put("modified",modified).put("nextUs",nextUs).put("text",text).put("tail",tail)
        .put("match",match).put("likely",likely).put("compacted",compacted).put("chunks",chunks).toString()
    companion object {
        fun restore(raw:String?,size:Long,modified:Long):RecordingProgress?=try {
            if(raw==null) null else JSONObject(raw).let { j ->
                val next=j.getLong("nextUs");val text=j.getString("text");val tail=j.getString("tail");val match=j.getString("match");val count=j.getInt("chunks")
                if(j.getLong("size")!=size || j.getLong("modified")!=modified || next<0 || count<0 || next!=count.toLong()*OfflineChunkPolicy.LENGTH_US || text.length>24005 || tail.length>200 || match.length>5000) null
                else RecordingProgress(size,modified,next,text,tail,match,j.optBoolean("likely"),j.optBoolean("compacted"),count)
            }
        } catch(_:Exception) { null }
    }
}

internal object OfflineChunkPolicy {
    const val LENGTH_US=60L*1_000_000
    const val OVERLAP_US=1L*1_000_000
}
