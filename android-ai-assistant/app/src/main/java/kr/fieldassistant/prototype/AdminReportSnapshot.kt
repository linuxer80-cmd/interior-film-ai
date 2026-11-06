package kr.fieldassistant.prototype

import org.json.JSONArray
import org.json.JSONObject

/** Detect changes to the report, costs or photos shown to a reviewer. */
internal object AdminReportSnapshot {
    fun key(data:JSONObject):String? {
        val report=data.optJSONObject("report") ?: return null
        if(!data.optBoolean("hasReport") || data.optJSONObject("review")?.optString("status")!="pending") return null
        val id=report.optString("id");val updated=report.optString("updated_at")
        if(id.isBlank() || updated.isBlank() || id=="null" || updated=="null") return null
        fun items(key:String,fields:List<String>):List<String>? {
            val arr=data.optJSONArray(key) ?: return null
            if(arr.length()>500) return null
            val result=mutableListOf<String>()
            for(i in 0 until arr.length()) {
                val row=arr.optJSONObject(i) ?: return null
                if(row.optString("id").isBlank() || row.isNull("id")) return null
                val values=JSONArray()
                fields.forEach { field -> values.put(if(!row.has(field) || row.isNull(field)) JSONObject.NULL else row.opt(field)) }
                result.add(values.toString())
            }
            return result.sorted()
        }
        val materials=items("materials",listOf("id","brand","product_code","product_name","quantity","unit","unit_price","total_price","memo")) ?: return null
        val expenses=items("expenses",listOf("id","expense_type","amount","description","expense_date","created_by","reimbursement_worker_id")) ?: return null
        val before=items("beforePhotos",listOf("id","photo_type","storage_path")) ?: return null
        val after=items("afterPhotos",listOf("id","photo_type","storage_path")) ?: return null
        return JSONArray().put(id).put(updated).put(report.optString("worker_id"))
            .put(data.optJSONObject("worker")?.optString("name").orEmpty())
            .put(report.optString("work_region")).put(report.optString("work_summary")).put(report.optString("memo"))
            .put(JSONArray(materials)).put(JSONArray(expenses)).put(JSONArray(before)).put(JSONArray(after)).toString()
    }
}
