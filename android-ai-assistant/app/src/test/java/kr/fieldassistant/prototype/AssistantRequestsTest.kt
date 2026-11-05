package kr.fieldassistant.prototype
import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test
class AssistantRequestsTest {
    private val monday=LocalDate.of(2026,11,2)
    @Test fun briefingRequestsDoNotExecuteChanges() {
        for(text in listOf("오늘 내가 챙겨야 할 현장 알려줘", "오늘 할 일 알려줘", "오늘 어디 가고 무슨 작업해"))
            assertEquals(text,"briefing",AssistantRequests.parse(text,monday).kind)
        assertNotEquals("briefing",AssistantRequests.parse("오늘 할 일 취소해줘",monday).kind)
    }
    @Test fun materialPreparationIsReadOnly() {
        assertEquals("materials",AssistantRequests.parse("그 현장 자재 준비 현황 알려줘",monday).feature)
        assertNotEquals("materials",AssistantRequests.parse("그 현장 자재 반출해줘",monday).feature)
    }
    @Test fun understandsWeeklySitesAndFollowup() {
        val r=AssistantRequests.parse("이번주현장 알려줘",monday)
        assertEquals("schedule",r.kind);assertEquals("2026-11-02",r.from);assertEquals("2026-11-08",r.to)
        val next=AssistantRequests.parse("다음 주는?",monday)
        assertEquals("2026-11-09",next.from);assertEquals("2026-11-15",next.to)
    }
    @Test fun understandsConversationalSiteSearchAndRecentWork() {
        for(text in listOf("청라 현장을 보여줄 수 있을까?", "혹시 청라 현장 좀 찾아줄래?", "제가 지난번 등록한 청라 현장 알려줘")) {
            val r=AssistantRequests.parse(text,monday);assertEquals(text,"sites",r.kind);assertEquals(text,"청라",r.query)
        }
        assertEquals("다산",AssistantRequests.parse("현장 다산 찾아줘",monday).query)
        assertEquals("정보통신빌딩",AssistantRequests.parse("현장 정보통신빌딩 찾아줘",monday).query)
        assertEquals("",AssistantRequests.parse("우리 현장 목록 좀 보여줘",monday).query)
        assertEquals("청라",NaturalLanguage.siteNameBefore("혹시 청라 현장에 전화 좀 걸어줘"))
        assertEquals("",NaturalLanguage.siteNameBefore("그 현장에 전화해줘"))
        assertNull(SampleSearch.parse("현대 아파트 현장 보여줘"))
        assertEquals("new-site",AssistantRequests.parse("현장 하나 만들어줘",monday).feature)
        assertEquals("schedule",AssistantRequests.parse("오늘 뭐 해?",monday).kind)
    }
    @Test fun conversationalPeriodsArePreciseAndUnclearWeekdaysAreNotGuessed() {
        val day=AssistantRequests.parse("다음 주 수요일에 일정 뭐 있어?",monday)
        assertEquals("2026-11-11",day.from);assertEquals(day.from,day.to)
        val past=AssistantRequests.parse("저번 주 금요일 현장 알려줘",monday)
        assertEquals("2026-10-30",past.from);assertEquals(past.from,past.to)
        val exact=AssistantRequests.parse("2024년 2월 29일 현장 보여줘",monday)
        assertEquals("2024-02-29",exact.from);assertEquals(exact.from,exact.to)
        assertEquals("unknown",AssistantRequests.parse("2026년 2월 30일 일정",monday).kind)
        assertEquals("unknown",AssistantRequests.parse("수요일 현장 알려줘",monday).kind)
    }
    @Test fun understandsBusinessSynonymsWithoutSkippingWriteSafety() {
        val r=AssistantRequests.parse("지난달에 얼마나 벌었어?",monday)
        assertEquals("profit",r.kind);assertEquals("2026-10-01",r.from);assertEquals("2026-10-31",r.to)
        assertEquals("receivables",AssistantRequests.parse("못 받은 돈 확인해줘",monday).feature)
        assertEquals("inventory",AssistantRequests.parse("남은 필름 보여줘",monday).feature)
        assertEquals("customer-chat",AssistantRequests.parse("고객이랑 대화 보여줘",monday).feature)
        assertEquals("site_action",AssistantRequests.parse("그 현장에 전화 좀 걸어줘",monday).kind)
        assertNotEquals("schedule",AssistantRequests.parse("다음 주 수요일 현장 취소해줘",monday).kind)
    }
    @Test fun handlesSundayYearBoundaryAndLeapMonth() {
        val sunday=AssistantRequests.parse("이번 주",LocalDate.of(2027,1,3))
        assertEquals("2026-12-28",sunday.from);assertEquals("2027-01-03",sunday.to)
        assertEquals("2028-02-29",AssistantRequests.parse("이번 달 일정",LocalDate.of(2028,2,1)).to)
        assertEquals("2027-01-01",AssistantRequests.parse("내일 현장",LocalDate.of(2026,12,31)).from)
    }
    @Test fun understandsPastAndNamedMonths() {
        val last=AssistantRequests.parse("지난달현장 보여줘",monday)
        assertEquals("schedule",last.kind);assertEquals("2026-10-01",last.from);assertEquals("2026-10-31",last.to)
        assertEquals("2026-10-01",AssistantRequests.parse("10월현장 보여줘",monday).from)
        assertEquals("2024-02-29",AssistantRequests.parse("2024년 2월 현장",monday).to)
        assertEquals("2025-12-01",AssistantRequests.parse("지난달 현장",LocalDate.of(2026,1,2)).from)
        assertEquals("unknown",AssistantRequests.parse("13월 현장",monday).kind)
    }
    @Test fun findsNamedSiteAndExplicitNumber() {
        assertEquals("청라",AssistantRequests.parse("청라 현장 찾아줘",monday).query)
        assertEquals(0,AssistantRequests.parse("1번 현장 상세",monday).index)
        assertEquals("detail",AssistantRequests.parse("거기 주소",monday).kind)
        assertEquals("unknown",AssistantRequests.parse("2026-02-30 일정",monday).kind)
    }
    @Test fun neverTurnsMutationIntoScheduleReadOrWrite() {
        assertEquals("feature",AssistantRequests.parse("이번 주 현장 금요일로 옮겨줘",monday).kind)
        assertEquals("unknown",AssistantRequests.parse("다음 주는 취소",monday).kind)
        assertEquals("feature",AssistantRequests.parse("두 롤 반출해줘",monday).kind)
    }
    @Test fun emptyWorkDatesFallBackToScheduledRange() {
        val sites=org.json.JSONArray("""[{"id":"11111111-1111-1111-1111-111111111111","company_id":"22222222-2222-2222-2222-222222222222","status":"scheduled","site_name":"test","work_dates":[],"schedule_start":"2026-11-02","schedule_end":"2026-11-03"}]""")
        assertEquals(2,ScheduleDates.fromSites(sites,"2026-11-02","2026-11-08").size)
        assertEquals("unknown",AssistantRequests.parse("0번 현장",monday).kind)
    }
    @Test fun laborRequestsOpenJobsForBothRoles() {
        for(text in listOf("구인구직", "시공자 구인", "구직 등록", "일자리 보여줘", "지원자 확인", "받은 제안")) {
            val r=AssistantRequests.parse(text,monday)
            assertEquals("feature",r.kind);assertEquals("jobs",r.feature)
        }
        assertNotNull(AssistantRequests.feature("jobs",true));assertNotNull(AssistantRequests.feature("jobs",false))
        assertEquals("/jobs",AssistantRequests.feature("jobs",true)?.path)
    }
    @Test fun tradeClientRoutingIsOwnerOnly() {
        for (text in listOf("거래처 관리", "거래처 등록", "드림아트 거래처 보여줘")) {
            val request=AssistantRequests.parse(text,monday)
            assertEquals("feature",request.kind);assertEquals("clients",request.feature)
        }
        assertNull(AssistantRequests.feature("clients",false))
        assertEquals("/admin/clients",AssistantRequests.feature("clients",true)?.path)
    }
    @Test fun customerPageRequestsStayOwnerOnly() {
        for (text in listOf("고객페이지 관리", "고객 페이지 견적 링크", "고객홈페이지 수정", "업체소개 관리")) {
            val r=AssistantRequests.parse(text,monday)
            assertEquals("feature",r.kind);assertEquals("customer-page",r.feature)
        }
        assertNull(AssistantRequests.feature("customer-page",false))
        assertEquals("/admin/customer-page",AssistantRequests.feature("customer-page",true)?.path)
    }
    @Test fun registrationOpensExplicitOwnerOnlyFlow() {
        for (text in listOf("현장등록", "새 현장 등록", "신규 현장 등록", "현장 추가")) {
            val request=AssistantRequests.parse(text,monday)
            assertEquals("feature",request.kind)
            assertEquals("new-site",request.feature)
        }
        assertNull(AssistantRequests.feature("new-site",false))
        assertTrue(AssistantRequests.feature("new-site",true)!!.path.contains("assistantRegister=1"))
    }
    @Test fun recognizesSiteWorkRequests() {
        assertEquals("film",AssistantRequests.parse("필름 사용량 등록",monday).feature)
        assertEquals("expenses",AssistantRequests.parse("경비 입력",monday).feature)
        assertEquals("report",AssistantRequests.parse("완료보고 작성",monday).feature)
        assertEquals("site_action",AssistantRequests.parse("필름 사용량 등록",monday).kind)
        assertEquals("phone",AssistantRequests.parse("전화 걸어줘",monday).feature)
        assertEquals("phone",AssistantRequests.parse("대림 현장 전화해줘",monday).feature)
        assertEquals("navigate",AssistantRequests.parse("길 안내해줘",monday).feature)
        assertEquals("navigate",AssistantRequests.parse("그 현장 네비 켜줘",monday).feature)
        assertNotEquals("phone",AssistantRequests.parse("새로운 전화 아니요",monday).feature)
        val todayTasks=AssistantRequests.parse("오늘 할 일 알려줘",monday)
        assertEquals("briefing",todayTasks.kind)
        assertEquals(monday.toString(),todayTasks.from)
        assertEquals(monday.toString(),todayTasks.to)
    }
    @Test fun workerFeaturesDoNotExposeOwnerScreens() {
        assertNull(AssistantRequests.feature("receivables",false))
        assertEquals("/worker/inventory",AssistantRequests.feature("inventory",false)?.path)
        assertEquals("/worker",AssistantRequests.feature("sites",false)?.path)
        assertNull(AssistantRequests.feature("https://evil.example",true))
    }
    @Test fun profitQueriesRetainRequestedPeriod() {
        val today=java.time.LocalDate.of(2026,11,2)
        val last=AssistantRequests.parse("지난달 매출 알려줘",today)
        assertEquals("profit",last.kind)
        assertEquals("2026-10-01",last.from)
        assertEquals("2026-10-31",last.to)
        val month=AssistantRequests.parse("2025년 2월 수익",today)
        assertEquals("2025-02-01",month.from)
        assertEquals("2025-02-28",month.to)
        val current=AssistantRequests.parse("매출 보여줘",today)
        assertEquals("2026-11-01",current.from)
        assertEquals("2026-11-02",current.to)
        assertEquals("unknown",AssistantRequests.parse("13월 매출",today).kind)
        assertEquals("unknown",AssistantRequests.parse("3분기 수익",today).kind)
        assertEquals("2025-01-01",AssistantRequests.parse("작년 매출",today).from)
        assertEquals("2025-12-31",AssistantRequests.parse("작년 매출",today).to)
    }
}



