package kr.fieldassistant.prototype

import org.json.JSONArray
import org.json.JSONObject

internal object AttendanceModel {
    fun rows(data:JSONObject,key:String):List<JSONObject> = data.optJSONArray(key)?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()
    fun open(record:JSONObject)=record.isNull("clock_out") || record.optString("clock_out").isBlank()
    fun scoped(data:JSONObject,company:String):JSONObject {
        val workers=rows(data,"workers").filter { it.optString("company_id")==company }
        val workerIds=workers.map { it.optString("id") }.toSet()
        return JSONObject().put("workers",JSONArray(workers))
            .put("sites",JSONArray(rows(data,"sites").filter { it.optString("company_id")==company }))
            .put("records",JSONArray(rows(data,"records").filter { it.optString("company_id")==company && it.optString("worker_id") in workerIds }))
    }
    fun allowed(data:JSONObject,company:String,body:JSONObject):Boolean {
        val scoped=scoped(data,company);val records=rows(scoped,"records")
        return when(body.optString("action")) {
            "in" -> records.none(::open) && rows(scoped,"sites").any { it.optString("id")==body.optString("siteId") && it.optBoolean("canClockIn") }
            "out" -> records.any { it.optString("id")==body.optString("id") && open(it) }
            else -> false
        }
    }
    fun validGps(latitude:Double,longitude:Double,accuracy:Double,ageMillis:Long)=
        latitude.isFinite() && longitude.isFinite() && accuracy.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0 && accuracy in 0.0..100000.0 && ageMillis in 0..120000
    fun time(value:String):String = try {
        java.time.OffsetDateTime.parse(value).atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul"))
            .format(java.time.format.DateTimeFormatter.ofPattern("MM/dd HH:mm"))
    } catch(_:Exception) { "미기록" }
}
