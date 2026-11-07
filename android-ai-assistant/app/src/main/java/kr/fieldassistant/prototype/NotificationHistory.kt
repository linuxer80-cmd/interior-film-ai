package kr.fieldassistant.prototype
import org.json.JSONArray
import org.json.JSONObject
internal object NotificationHistory {
    fun retained(raw:String,now:Long):List<JSONObject> = try {
        val a=JSONArray(raw)
        (0 until a.length()).mapNotNull { a.optJSONObject(it) }
            .filter { it.optString("key").isNotBlank() && it.optLong("time") in (now-30L*24*60*60*1000)..now }
            .sortedByDescending { it.optLong("time") }.distinctBy { it.optString("key") }.take(200)
    } catch(_:Exception) { emptyList() }
    fun append(items:List<JSONObject>,entry:JSONObject):List<JSONObject> =
        if(items.any { it.optString("key")==entry.optString("key") }) items else (listOf(entry)+items).take(200)
}
