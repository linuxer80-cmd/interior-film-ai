package kr.fieldassistant.prototype
import org.json.JSONArray
import org.json.JSONObject

internal object ChatHistory {
    fun before(row:JSONObject,kind:String):String = row.optString("created_at") + if(kind=="team") "|"+row.optString("id") else ""
    fun displayTime(raw:String):String=try {
        java.time.OffsetDateTime.parse(raw).atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul"))
            .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
    } catch(_:Exception) { "시간 확인 중" }
    fun merge(history:Collection<JSONObject>,latest:JSONArray):JSONArray {
        val merged=linkedMapOf<String,JSONObject>()
        history.forEach { merged[it.getString("id")]=it }
        for(i in 0 until latest.length()) latest.optJSONObject(i)?.let { merged[it.getString("id")]=it }
        return JSONArray(merged.values.sortedWith(compareBy({it.optString("created_at")},{it.optString("id")})))
    }
}
