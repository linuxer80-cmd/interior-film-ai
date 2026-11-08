package kr.fieldassistant.prototype

import org.json.JSONObject

internal object NativeWorkflow {
    fun action(feature:String):String? = when(feature) {
        "quotes" -> "quote"
        "assignment" -> "schedule"
        "report" -> "report"
        "expenses" -> "expenses"
        "film-use" -> "film"
        "worker-stock" -> "materials"
        "payment" -> "payment"
        else -> null
    }
    fun matches(site:JSONObject,query:String):Boolean {
        val fields=listOf("site_name","customer_name","address","address_detail","customer_phone")
            .joinToString(" ") { site.optString(it).takeUnless { value -> value=="null" }.orEmpty() }
        return query.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.all { fields.contains(it,ignoreCase=true) || (it.filter(Char::isDigit).length>=4 && it.all { c -> c.isDigit() || c in "-+()" } && site.optString("customer_phone").filter(Char::isDigit).contains(it.filter(Char::isDigit))) }
    }
}
