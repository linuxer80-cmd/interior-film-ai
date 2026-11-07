package kr.fieldassistant.prototype
import org.json.JSONArray
import org.json.JSONObject

internal object ChatHistory {
    fun merge(history:Collection<JSONObject>,latest:JSONArray):JSONArray {
        val merged=linkedMapOf<String,JSONObject>()
        history.forEach { merged[it.getString("id")]=it }
        for(i in 0 until latest.length()) latest.optJSONObject(i)?.let { merged[it.getString("id")]=it }
        return JSONArray(merged.values.sortedWith(compareBy({it.optString("created_at")},{it.optString("id")})))
    }
}
