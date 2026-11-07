package kr.fieldassistant.prototype

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/** Bounded local intent router. Unknown commands are clarified, never executed. */
internal object AssistantRequests {
    data class Request(val kind:String,val from:String="",val to:String="",val query:String="",val feature:String="",val index:Int=-1)
    data class Feature(val id:String,val title:String,val path:String,val ownerOnly:Boolean=false)
    val features=listOf(
        Feature("new-site","새 현장 등록 · AI 상담 분석","/admin?tab=sites&assistantRegister=1",true),
        Feature("sites","현장 관리 · 일정 · 배정","/admin?tab=sites",true),
        Feature("quotes","현장 견적서 작성","/admin/quotes",true),
        Feature("quote-documents","전체 견적서 · 현장 없이 작성 · PDF","/admin/quotes",true),
        Feature("assignment","현장 일정 · 시공자 배정","/admin?tab=sites",true),
        Feature("payment","현장 입금 등록","/admin/receivables",true),
        Feature("report","완료보고 · 확인","/worker"),
        Feature("expenses","현장 경비 입력","/worker"),
        Feature("film-use","필름 사용량 · 남은 필름 반납","/worker"),
        Feature("inventory","필름 재고 · 입고 · 반출 · 반입","/admin/inventory",true),
        Feature("receivables","미수금 확인 · 입금 관리","/admin/receivables",true),
        Feature("profit","매출 · 수익","/admin?tab=profit",true),
        Feature("follow-ups","상담 후속 관리 · 동기화","/admin/follow-ups",true),
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
    private val nativeFeatures=setOf("new-site","customer-page","customer-chat","clients","jobs","sites","work","profit","samples","inventory","receivables","quotes","assignment","payment","report","expenses","film-use","all","attendance","workers","follow-ups")
    fun opensWeb(featureId:String):Boolean = featureId !in nativeFeatures
    fun parse(input:String,today:LocalDate): Request {
        val q=NaturalLanguage.normalize(input);val compact=q.replace(Regex("\\s+"),"")
        if(!Regex("취소|삭제|변경|등록|발송|보내|배정|완료처리").containsMatchIn(compact) &&
            ((compact.contains("오늘") && Regex("챙겨|할일|브리핑|준비할|뭐해야").containsMatchIn(compact)) ||
             compact in listOf("오늘어디가고무슨작업해","오늘어디가고무슨일해","오늘시공브리핑"))) return Request("briefing",from=today.toString(),to=today.toString())
        if(compact in listOf("오늘할일","오늘할일알려줘","오늘할일보여줘","오늘할일뭐야")) return Request("schedule",from=today.toString(),to=today.toString())
        if(compact in listOf("현장등록","새현장등록","신규현장등록","새로운현장등록","현장추가","현장등록해줘","새현장등록해줘")) return Request("feature",feature="new-site")
        if(Regex("현장(?:을|를)?(?:하나|새로|새롭게)?(?:만들|추가|등록|생성)").containsMatchIn(compact)) return Request("feature",feature="new-site")
        if(compact.contains("고객페이지") || compact.contains("고객홈페이지") || compact.contains("업체소개관리")) return Request("feature",feature="customer-page")
        if(Regex("구인|구직|일자리|지원자|받은제안|모집현황").containsMatchIn(compact)) return Request("feature",feature="jobs")
        if(compact.contains("사진") && (Regex("보여|보기|확인|볼래|볼수|열어").containsMatchIn(compact) || compact.endsWith("사진")) &&
            !Regex("견적|샘플|등록|추가|촬영|올려|업로드|삭제|보내|공유").containsMatchIn(compact)) {
            val kind=when { Regex("시공전|작업전").containsMatchIn(compact)->"before";Regex("시공후|완료|작업후").containsMatchIn(compact)->"after";Regex("고객요청|요청사진|상담사진").containsMatchIn(compact)->"request";else->"all" }
            return Request("site_action",feature="gallery",query=kind)
        }
        val siteAction=when {
            Regex("팀채팅|팀원채팅|현장채팅").containsMatchIn(compact) -> "team_chat"
            Regex("마무리|마쳤|끝났|끝냈|끝냈어|작업끝|시공끝").containsMatchIn(compact) &&
                !Regex("삭제|취소|발송|보내|승인|완료처리|등록").containsMatchIn(compact) -> "wrap_up"
            (compact.contains("현장") || compact.contains("준비") || compact.startsWith("거기")) &&
                (compact.contains("자재") || compact.contains("필름")) && Regex("준비|재고|반출|반입").containsMatchIn(compact) &&
                Regex("현황|확인|알려|보여|준비할|뭐|살펴").containsMatchIn(compact) &&
                !Regex("반출해|반입해|반납해|등록해|저장해|취소해").containsMatchIn(compact) -> "materials"
            (compact.contains("현장") || compact.startsWith("전화") || compact.startsWith("거기") || compact.startsWith("고객")) && Regex("전화(걸어|걸기|해줘|해주세요|해)|통화(걸어|해줘)").containsMatchIn(compact) -> "phone"
            (compact.contains("현장") || compact.startsWith("길") || compact.startsWith("네비") || compact.startsWith("거기") || compact.startsWith("어떻게가")) && Regex("길안내|길찾|네비|내비|지도|어떻게가").containsMatchIn(compact) -> "navigate"
            (compact.contains("필름") || compact.contains("자재")) && (compact.contains("사용") || compact.contains("입력") || compact.contains("등록")) -> "film"
            compact.contains("경비") && (compact.contains("입력") || compact.contains("등록") || compact.contains("작성")) -> "expenses"
            (compact.contains("완료보고") || compact.contains("보고서")) && (compact.contains("입력") || compact.contains("등록") || compact.contains("작성")) -> "report"
            else -> ""
        }
        if(siteAction.isNotBlank()) return Request("site_action",feature=siteAction)
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
        if(feature=="profit" && !action) {
            val yearMatch=Regex("(?<![0-9])(\\d{4})년").find(compact)
            if(!compact.contains("월") && (yearMatch!=null || compact.contains("올해") || compact.contains("작년") || compact.contains("지난해"))) {
                val year=yearMatch?.groupValues?.get(1)?.toIntOrNull() ?: if(compact.contains("작년") || compact.contains("지난해")) today.year-1 else today.year
                val first=try { LocalDate.of(year,1,1) } catch(_:Exception) { return Request("unknown") }
                return Request("profit",from=first.toString(),to=first.withMonth(12).withDayOfMonth(31).toString())
            }
            val explicit=Regex("지난달|저번달|전달|다음달|이번달|이달|이번주|지난주|저번주|다음주|오늘|어제|내일|모레|주말|\\d{1,2}월|\\d{4}-\\d{2}-\\d{2}").containsMatchIn(compact)
            if(!explicit && Regex("분기|상반기|하반기|지난해|올해|[0-9]+년|[0-9]+월|[0-9]+일").containsMatchIn(compact)) return Request("unknown")
            if(!explicit) return Request("profit",from=today.withDayOfMonth(1).toString(),to=today.toString())
            val period=parse(compact.replace("매출","").replace("수익","")+"일정",today)
            if(period.kind!="schedule") return Request("unknown")
            return Request("profit",from=period.from,to=period.to)
        }
        if(feature.isNotEmpty()) return Request("feature",feature=feature)
        if(action) return Request("unknown")
        if(compact in listOf("전체기능","기능목록","도움말","뭐할수있어","메뉴")) return Request("features")
        Regex("^(\\d{1,2})번(?:현장)?(?:상세|주소|정보|보여줘|알려줘)?[?.!]*$").matchEntire(compact)?.let { return if(it.groupValues[1].toInt()>0) Request("detail",index=it.groupValues[1].toInt()-1) else Request("unknown") }
        if(compact in listOf("그현장","그현장상세","그현장주소","거기주소","상세보기")) return Request("detail")
        val monday=today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val weekday=Regex("(월|화|수|목|금|토|일)요일").find(compact)
        if(weekday!=null) {
            val n=when(weekday.groupValues[1]) { "월"->0;"화"->1;"수"->2;"목"->3;"금"->4;"토"->5;else->6 }
            val base=when { compact.contains("다음주")->monday.plusWeeks(1);compact.contains("지난주")||compact.contains("저번주")->monday.minusWeeks(1);compact.contains("이번주")->monday;else->null }
            if(base==null) return Request("unknown")
            val day=base.plusDays(n.toLong());return Request("schedule",from=day.toString(),to=day.toString())
        }
        Regex("(?<![0-9])(\\d{4})년(\\d{1,2})월(\\d{1,2})일|(?<![0-9])(\\d{1,2})월(\\d{1,2})일").find(compact)?.let { m ->
            val year=m.groupValues[1].toIntOrNull() ?: today.year
            val month=(m.groupValues[2].ifEmpty { m.groupValues[4] }).toIntOrNull() ?: return Request("unknown")
            val day=(m.groupValues[3].ifEmpty { m.groupValues[5] }).toIntOrNull() ?: return Request("unknown")
            return try { val date=LocalDate.of(year,month,day).toString();Request("schedule",from=date,to=date) } catch(_:Exception) { Request("unknown") }
        }
        val range=when {
            compact.contains("다음주") -> monday.plusWeeks(1) to monday.plusDays(13)
            compact.contains("지난주") || compact.contains("저번주") -> monday.minusWeeks(1) to monday.minusDays(1)
            compact.contains("주말") -> monday.plusDays(5) to monday.plusDays(6)
            compact.contains("이번주") || compact.contains("금주") -> monday to monday.plusDays(6)
            compact.contains("지난달") || compact.contains("저번달") || compact.contains("전달") -> today.minusMonths(1).withDayOfMonth(1).let { it to it.withDayOfMonth(it.lengthOfMonth()) }
            compact.contains("다음달") -> today.plusMonths(1).withDayOfMonth(1).let { it to it.withDayOfMonth(it.lengthOfMonth()) }
            compact.contains("이번달") || compact.contains("이달") -> today.withDayOfMonth(1) to today.withDayOfMonth(today.lengthOfMonth())
            compact.contains("모레") -> today.plusDays(2) to today.plusDays(2)
            compact.contains("내일") -> today.plusDays(1) to today.plusDays(1)
            compact.contains("어제") -> today.minusDays(1) to today.minusDays(1)
            compact.contains("오늘") -> today to today
            else -> null
        }
        if(range!=null) return Request("schedule",from=range.first.toString(),to=range.second.toString())
        val explicitMonth=Regex("(?<![0-9])(?:(\\d{4})년)?(\\d{1,2})월").find(compact)
        if(explicitMonth!=null) {
            val year=explicitMonth.groupValues[1].toIntOrNull() ?: today.year
            val month=explicitMonth.groupValues[2].toIntOrNull() ?: return Request("unknown")
            val day=try { LocalDate.of(year,month,1) } catch(_:Exception) { return Request("unknown") }
            return Request("schedule",from=day.toString(),to=day.withDayOfMonth(day.lengthOfMonth()).toString())
        }
        Regex("\\d{4}-\\d{2}-\\d{2}").find(compact)?.value?.let { date ->
            try { LocalDate.parse(date);return Request("schedule",from=date,to=date) } catch(_:Exception) { return Request("unknown") }
        }
        if(compact.contains("일정") || compact in listOf("오늘어디가","오늘어디가야해","오늘뭐해","오늘뭐하지")) return Request("schedule",from=today.toString(),to=today.toString())
        if(compact in listOf("현장","현장목록","내현장","전체현장","현장알려줘","현장보여줘")) return Request("sites")
        if(compact.contains("현장") || compact.contains("찾아")) {
            val term=NaturalLanguage.siteQuery(q)
            return Request("sites",query=term)
        }
        return Request("unknown")
    }
    fun feature(id:String,owner:Boolean):Feature? {
        val actual=if(!owner && id=="inventory") "worker-stock" else if(!owner && id=="sites") "work" else id
        return features.find { it.id==actual && (owner || !it.ownerOnly) }
    }
}



