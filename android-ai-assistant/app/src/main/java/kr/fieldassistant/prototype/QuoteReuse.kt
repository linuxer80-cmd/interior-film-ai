package kr.fieldassistant.prototype
import org.json.JSONArray
import org.json.JSONObject
internal object QuoteReuse {
    fun items(source:JSONObject,clearQuantity:Boolean):JSONArray {
        val rows=source.optJSONArray("items") ?: throw IllegalArgumentException("저장된 견적 항목이 없습니다.")
        require(rows.length() in 1..60) { "견적 항목은 1~60개만 가져올 수 있습니다." }
        return JSONArray().apply {
            for(i in 0 until rows.length()) {
                val original=rows.getJSONObject(i);val row=JSONObject()
                listOf("name","detail","quantity","unit","film_no","unit_price").forEach { key ->
                    row.put(key,if(key=="quantity" && clearQuantity) "" else original.optString(key).takeUnless { it=="null" }.orEmpty())
                }
                row.put("note","");put(row)
            }
        }
    }
}
