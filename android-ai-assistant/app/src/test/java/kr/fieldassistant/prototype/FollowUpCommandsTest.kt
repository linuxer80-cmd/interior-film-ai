package kr.fieldassistant.prototype
import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test
class FollowUpCommandsTest {
    private val today=LocalDate.of(2026,12,31)
    @Test fun readsQueuesWithoutChangingThem() {
        assertEquals("due",FollowUpCommands.parse("오늘 연락할 고객 보여줘",today)?.kind)
        assertEquals("waiting",FollowUpCommands.parse("답변 기다리는 상담",today)?.kind)
        assertEquals("briefing",FollowUpCommands.parse("상담 브리핑 알려줘",today)?.kind)
        assertEquals("overdue",FollowUpCommands.parse("미뤄진 상담 보여줘",today)?.kind)
    }
    @Test fun resolvesRelativeDatesAcrossYearBoundary() {
        assertEquals("2027-01-01",FollowUpCommands.parse("내일 다시 연락해줘",today)?.date)
        assertEquals("2027-01-02",FollowUpCommands.parse("모레 연락할게",today)?.date)
        assertEquals("2027-02-03",FollowUpCommands.parse("2027-02-03 다시 연락",today)?.date)
        assertNull(FollowUpCommands.parse("2027-02-30 다시 연락",today))
    }
    @Test fun createsExplicitReviewProposals() {
        assertEquals("waiting",FollowUpCommands.parse("견적 보냈어",today)?.stage)
        assertEquals("photos",FollowUpCommands.parse("사진 요청할게",today)?.action)
        assertEquals("closed",FollowUpCommands.parse("상담 종료해줘",today)?.stage)
    }
    @Test fun rejectsNegationQuotedTextAndMixedActions() {
        for(text in listOf("상담 종료하지마","견적 안 보냈어","사진 보내줘","견적 작성해줘","고객이 내일 다시 연락해줘라고 했어","내일 다시 연락하고 현장 삭제해줘","내일 다시 연락하지마"))
            assertNull(text,FollowUpCommands.parse(text,today))
    }
}
