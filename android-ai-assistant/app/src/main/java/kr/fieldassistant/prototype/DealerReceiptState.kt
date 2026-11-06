package kr.fieldassistant.prototype

import org.json.JSONObject

/** Update only the receipt row linked to the confirmed receive request. */
internal object DealerReceiptState {
    fun confirmed(draft:String,requestId:String):String {
        val data=JSONObject(draft)
        val rows=data.getJSONObject("analysis").getJSONArray("rows")
        val matches=(0 until rows.length()).map { rows.getJSONObject(it) }.filter { it.optString("_requestId")==requestId }
        check(matches.size<=1) { "같은 입고 요청이 여러 품목에 연결되어 있습니다." }
        matches.singleOrNull()?.apply { put("_done",true);remove("_requestId") }
        return data.toString()
    }
}
