package kr.fieldassistant.prototype

import org.json.JSONObject

internal object SiteListOrder {
    fun newestFirst(sites:List<JSONObject>):List<JSONObject> = sites.sortedWith(
        compareByDescending<JSONObject> { it.optString("created_at").takeUnless { value -> value=="null" }.orEmpty() }
            .thenBy { it.optString("site_name").takeUnless { value -> value=="null" }.orEmpty() }
    )
}
