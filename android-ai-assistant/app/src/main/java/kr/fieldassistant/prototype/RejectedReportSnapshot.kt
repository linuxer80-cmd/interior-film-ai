package kr.fieldassistant.prototype

import org.json.JSONObject

/** Only combine report details when both responses describe the same saved revision. */
internal object RejectedReportSnapshot {
    fun matches(access:JSONObject,support:JSONObject):Boolean {
        if(!access.optBoolean("canSubmit")) return false
        val a=access.optJSONObject("report") ?: return false
        val b=support.optJSONObject("report") ?: return false
        fun nonempty(row:JSONObject,key:String):String? = row.optString(key).takeUnless { it.isBlank() || it=="null" }
        val id=nonempty(a,"id") ?: return false
        val revision=nonempty(a,"updated_at") ?: return false
        return id==nonempty(b,"id") && revision==nonempty(b,"updated_at") && a.optString("review_status")=="rejected" && b.optString("review_status")=="rejected"
    }
}
