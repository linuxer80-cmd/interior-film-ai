package kr.fieldassistant.prototype

import org.json.JSONArray
import org.json.JSONObject

/** Read-only summaries; unknown or inaccessible data never becomes a completed task. */
internal object DailyAssistant {
    data class Site(val id:String,val name:String,val address:String,val work:String,val reportStatus:String)
    data class Briefing(val sites:List<Site>,val consultations:Int?)
    private fun value(row:JSONObject,key:String)=row.optString(key).takeUnless { it=="null" }.orEmpty().trim()
    fun briefing(rows:JSONArray,companyId:String,owner:Boolean,date:String):Briefing {
        val scoped=JSONArray()
        for(i in 0 until rows.length()) rows.optJSONObject(i)?.takeIf { value(it,"company_id")==companyId }?.let(scoped::put)
        val ids=ScheduleDates.fromSites(scoped,date,date).map { it.id.substringAfter('/') }.toSet()
        val sites=(0 until scoped.length()).mapNotNull { scoped.optJSONObject(it) }.filter {
            value(it,"id").ifBlank { value(it,"site_id") } in ids
        }.map { row ->
            Site(value(row,"id").ifBlank { value(row,"site_id") },value(row,"site_name").ifBlank { "이름 없는 현장" },
                listOf(value(row,"address"),value(row,"address_detail")).filter { it.isNotBlank() }.joinToString(" "),
                value(row,"work_description"),value(row,"report_review_status"))
        }.sortedBy { it.name }
        val count=if(owner) (0 until scoped.length()).count { scoped.optJSONObject(it)?.optString("status")=="consulting" } else null
        return Briefing(sites,count)
    }
    fun wrapUp(siteId:String,report:JSONObject?,support:JSONObject?,stock:JSONObject?):String {
        val lines=mutableListOf<String>()
        if(report==null || !report.has("report")) lines.add("완료보고: 확인하지 못했습니다.")
        else {
            val r=report.optJSONObject("report")
            val status=when(r?.optString("review_status")) {
                "pending" -> "제출됨 · 관리자 검수 대기";"approved" -> "관리자 승인 완료";"rejected" -> "반려됨 · 관리자 의견 확인"
                null -> "제출 기록 없음";else -> "상태 확인 필요"
            }
            lines.add("완료보고: $status")
        }
        if(support==null || !support.has("afterCount") || support.isNull("afterCount")) lines.add("시공 완료 사진: 확인하지 못했습니다.")
        else {
            val n=support.optInt("afterCount",-1)
            lines.add(when { n<0 -> "시공 완료 사진: 확인하지 못했습니다.";n==0 -> "시공 완료 사진: 등록된 사진 없음";else -> "시공 완료 사진: ${n}장 등록됨" })
        }
        val trips=stock?.optJSONArray("trips")
        if(trips==null) lines.add("자재 반입: 확인하지 못했습니다.")
        else {
            var pending=0;var incomplete=false
            for(i in 0 until trips.length()) {
                val t=trips.optJSONObject(i)
                if(t==null) { incomplete=true;continue }
                if(value(t,"site_id")!=siteId) continue
                if(!t.has("returned")) incomplete=true else if(t.isNull("returned")) pending++
            }
            lines.add(when { incomplete -> "자재 반입: 일부 내역을 확인하지 못했습니다.";pending>0 -> "반입 기록이 없는 반출 롤: ${pending}개 · 사용·반입 여부 확인";else -> "자재 반입: 확인된 미반입 롤 없음" })
        }
        lines.add("경비: 등록할 내역이 있는지 직접 확인")
        lines.add("조회 시점의 기록입니다. 확인만으로 보고서 제출이나 자재 반납이 처리되지는 않습니다.")
        return lines.joinToString("\n")
    }
}
