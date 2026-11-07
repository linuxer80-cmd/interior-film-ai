package kr.fieldassistant.prototype

import org.json.JSONObject
import java.time.LocalDate

internal object ConsultationFollowUp {
    val stages=linkedMapOf("draft" to "견적 작성 전","sent" to "견적 전달","waiting" to "고객 답변 대기","closed" to "상담 종료")
    val actions=linkedMapOf("photos" to "사진 요청","estimate" to "견적 작성","send" to "견적 보내기","contact" to "다시 연락하기","wait" to "고객 답변 기다리기")
    fun stage(item:JSONObject)=item.optJSONObject("follow_up")?.optString("stage")?.takeIf { it in stages } ?: "draft"
    fun action(item:JSONObject)=item.optJSONObject("follow_up")?.optString("action")?.takeIf { it in actions } ?: "estimate"
    fun date(item:JSONObject)=item.optJSONObject("follow_up")?.optString("date").orEmpty().takeIf { validDate(it) }.orEmpty()
    fun validDate(value:String)=Regex("\\d{4}-\\d{2}-\\d{2}").matches(value) && runCatching { LocalDate.parse(value) }.isSuccess
    fun normalizedDate(value:String):String {
        if(value.isBlank()) return ""
        val dates=ConsultationInput.dates(value)
        require(dates.size==1) { "연락 날짜를 하나만 입력해 주세요." }
        return dates.single()
    }
    fun waiting(item:JSONObject,today:String)=stage(item)=="waiting" && (date(item).isBlank() || date(item)>today)
    fun label(item:JSONObject,today:String):String {
        val date=date(item)
        val due=when { date.isBlank()->"";date<today->" · 연락일 지남 $date";date==today->" · 오늘 연락";else->" · $date 연락" }
        return "${stages[stage(item)]} · ${actions[action(item)]}$due"
    }
    fun eligible(item:JSONObject,company:String,disposition:String):Boolean =
        item.optString("chat_company")==company && disposition!="declined" &&
            (item.optJSONObject("chat_draft")!=null || item.optJSONObject("registration")!=null) && stage(item)!="closed"
    fun ordered(items:List<JSONObject>,today:String)=items.sortedWith(compareBy<JSONObject>(
        { waiting(it,today) },{ date(it).isBlank() },{ date(it).ifBlank { "9999-12-31" } }))
}
