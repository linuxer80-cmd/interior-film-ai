package kr.fieldassistant.prototype
import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test
class AssistantRequestsTest {
    private val monday=LocalDate.of(2026,11,2)
    @Test fun understandsWeeklySitesAndFollowup() {
        val r=AssistantRequests.parse("이번주현장 알려줘",monday)
        assertEquals("schedule",r.kind);assertEquals("2026-11-02",r.from);assertEquals("2026-11-08",r.to)
        val next=AssistantRequests.parse("다음 주는?",monday)
        assertEquals("2026-11-09",next.from);assertEquals("2026-11-15",next.to)
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
        assertEquals("schedule",todayTasks.kind)
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


