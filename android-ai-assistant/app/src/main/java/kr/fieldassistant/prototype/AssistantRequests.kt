package kr.fieldassistant.prototype

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/** Bounded local intent router. Unknown commands are clarified, never executed. */
internal object AssistantRequests {
    data class Request(val kind:String,val from:String="",val to:String="",val query:String="",val feature:String="",val index:Int=-1)
    data class Feature(val id:String,val title:String,val path:String,val ownerOnly:Boolean=false)
    val features=listOf(
        Feature("sites","현장 관리 · 일정 · 배정","/admin?tab=sites",true),
        Feature("quotes","견적서 작성","/admin/quotes",true),
        Feature("inventory","필름 재고 · 입고 · 반출 · 반입","/admin/inventory",true),
        Feature("receivables","입금 · 미수금 관리","/admin/receivables",true),
        Feature("profit","매출 · 수익","/admin?tab=profit",true),
        Feature("workers","시공자 관리","/admin/workers",true),
        Feature("clients","거래처 관리","/admin/clients",true),
        Feature("customer-chat","고객 채팅","/admin/customer-chat",true),
        Feature("customer-page","고객 페이지 관리","/admin/customer-page",true),
        Feature("leads","고객 상담 · 사진 견적","/admin?tab=leads",true),
        Feature("register","시공 사진 · 실적 등록","/admin?tab=register",true),
        Feature("work","내 배정 현장 · 완료보고","/worker"),
        Feature("worker-stock","시공자 자재 반출 · 반입","/worker/inventory"),
        Feature("cutting","재단","/worker/cutting"),
        Feature("attendance","출퇴근","/worker/attendance"),
        Feature("samples","필름 샘플","/samples"),
        Feature("jobs","구인 · 구직","/jobs"),
        Feature("all","필름장이 전체 기능","/")
    )
    fun parse(input:String,today:LocalDate): Request {
        val q=input.trim();val compact=q.replace(Regex("\\s+"),"")
        val action=Regex("(바꿔|변경|옮겨|수정|삭제|취소|배정해|등록해|반출해|반입해|입금처리|보내줘|발송|승인해|반려해)").containsMatchIn(compact)
        val feature=when {
            compact.contains("재단") -> "cutting"
            compact.contains("미수") || compact.contains("입금") || compact.contains("잔금") -> "receivables"
            compact.contains("재고") || compact.contains("반출") || compact.contains("반입") || compact.contains("입고") -> "inventory"
            compact.contains("사진견적") -> "leads"
            compact.contains("견적") -> "quotes"
            compact.contains("매출") || compact.contains("수익") -> "profit"
            compact.contains("거래처") -> "clients"
            compact.contains("고객채팅") -> "customer-chat"
            compact.contains("고객페이지") -> "customer-page"
            compact.contains("시공자") && !compact.contains("현장") -> "workers"
            compact.contains("완료보고") || compact.contains("보고서") -> "work"
            compact.contains("출근") || compact.contains("퇴근") -> "attendance"
            compact.contains("샘플") -> "samples"
            compact.contains("구인") || compact.contains("구직") -> "jobs"
            action && (compact.contains("현장") || compact.contains("일정") || compact.contains("배정")) -> "sites"
            else -> ""
        }
        if(feature.isNotEmpty()) return Request("feature",feature=feature)
        if(action) return Request("unknown")
        if(compact in listOf("전체기능","기능목록","도움말","뭐할수있어","메뉴")) return Request("features")
        Regex("^(\\d{1,2})번(?:현장)?(?:상세|주소|정보|보여줘|알려줘)?[?.!]*$").matchEntire(compact)?.let { return if(it.groupValues[1].toInt()>0) Request("detail",index=it.groupValues[1].toInt()-1) else Request("unknown") }
        if(compact in listOf("그현장","그현장상세","그현장주소","거기주소","상세보기")) return Request("detail")
        val monday=today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val range=when {
            compact.contains("다음주") -> monday.plusWeeks(1) to monday.plusDays(13)
            compact.contains("지난주") || compact.contains("저번주") -> monday.minusWeeks(1) to monday.minusDays(1)
            compact.contains("주말") -> monday.plusDays(5) to monday.plusDays(6)
            compact.contains("이번주") || compact.contains("금주") -> monday to monday.plusDays(6)
            compact.contains("다음달") -> today.plusMonths(1).withDayOfMonth(1).let { it to it.withDayOfMonth(it.lengthOfMonth()) }
            compact.contains("이번달") || compact.contains("이달") -> today.withDayOfMonth(1) to today.withDayOfMonth(today.lengthOfMonth())
            compact.contains("모레") -> today.plusDays(2) to today.plusDays(2)
            compact.contains("내일") -> today.plusDays(1) to today.plusDays(1)
            compact.contains("어제") -> today.minusDays(1) to today.minusDays(1)
            compact.contains("오늘") -> today to today
            else -> null
        }
        if(range!=null) return Request("schedule",from=range.first.toString(),to=range.second.toString())
        Regex("\\d{4}-\\d{2}-\\d{2}").find(compact)?.value?.let { date ->
            try { LocalDate.parse(date);return Request("schedule",from=date,to=date) } catch(_:Exception) { return Request("unknown") }
        }
        if(compact.contains("일정")) return Request("schedule",from=today.toString(),to=today.toString())
        if(compact in listOf("현장","현장목록","내현장","전체현장","현장알려줘","현장보여줘")) return Request("sites")
        if(compact.contains("현장") || compact.contains("찾아")) {
            val term=q.replace(Regex("(현장|찾아줘|찾아주세요|알려줘|보여줘|검색해줘|검색|상세|주소|정보)")," ").trim()
            return Request("sites",query=term)
        }
        return Request("unknown")
    }
    fun feature(id:String,owner:Boolean):Feature? {
        val actual=if(!owner && id=="inventory") "worker-stock" else if(!owner && id=="sites") "work" else id
        return features.find { it.id==actual && (owner || !it.ownerOnly) }
    }
}
