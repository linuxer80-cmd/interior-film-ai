package kr.fieldassistant.prototype

import org.json.JSONObject

/** Describe a report cost without exposing its stored bookkeeping format. */
internal object AdminReportDisplay {
    fun expense(row:JSONObject):String {
        fun field(obj:JSONObject,key:String):String = obj.optString(key).takeUnless { it.isBlank() || it=="null" } ?: "확인 필요"
        val total=field(row,"amount")
        val description=row.optString("description").takeUnless { it=="null" }.orEmpty()
        val prefix="완료보고/인건비:"
        if(description.startsWith(prefix)) {
            val labor=try { JSONObject(description.removePrefix(prefix)) } catch(_:Exception) { return "인건비 상세 확인 필요 · 합계 ${total}원" }
            return "인건비 · "+field(labor,"name")+" · "+field(labor,"days")+"일 · 일당 "+field(labor,"dailyWage")+"원 · 수당 "+field(labor,"allowance")+"원 · 합계 "+total+"원"
        }
        val kind=when(row.optString("expense_type")) {
            "parking"->"주차비";"meal"->"식비";"fuel"->"유류비";"toll"->"통행료";"material"->"자재비";"other"->"기타";else->"경비"
        }
        val note=description.removePrefix("완료보고/").ifBlank { "내용 없음" }
        return "$kind · ${total}원 · $note"
    }
}
