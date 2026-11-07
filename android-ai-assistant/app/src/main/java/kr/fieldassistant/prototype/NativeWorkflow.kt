package kr.fieldassistant.prototype

import org.json.JSONObject

internal object NativeWorkflow {
    fun action(feature:String):String? = when(feature) {
        "quotes" -> "quote"
        "assignment" -> "schedule"
        "report" -> "report"
        "expenses" -> "expenses"
        "film-use" -> "film"
        "payment" -> "payment"
        else -> null
    }
    fun matches(site:JSONObject,query:String):Boolean {
        val fields=listOf("site_name","customer_name","address","address_detail")
            .joinToString(" ") { site.optString(it).takeUnless { value -> value=="null" }.orEmpty() }
        return query.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.all { fields.contains(it,ignoreCase=true) }
    }
}
