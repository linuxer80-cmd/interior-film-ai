package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class AssistantBriefingReportTest {
    @Test fun preservesNumbersAndNegationWithoutPostingCosts() {
        val d=SpokenReportDraft.parse("문 3개 완료, 필름 12.5m 사용, 주차비 만 원은 아직 안 냈어요")
        assertEquals("문 3개 완료",d.work)
        assertTrue(d.notes.contains("12.5m"));assertTrue(d.notes.contains("아직 안 냈어요"))
    }
    @Test fun preservesMixedSentenceInsteadOfGuessingAmounts() {
        val original="문 3개 완료 필름 12미터 사용 주차비 만 원"
        val d=SpokenReportDraft.parse(original)
        assertTrue(d.notes.contains(original));assertEquals(original,d.work)
    }
    @Test fun neverInventsMissingWork() {
        assertEquals("",SpokenReportDraft.parse("주차비 10000원").work)
        assertEquals("",SpokenReportDraft.parse(" ").notes)
    }
    @Test fun briefingCapsAtThreeAndPrioritizesReportIssues() {
        val sites=listOf("rejected","pending","approved").mapIndexed { i,s -> DailyAssistant.Site("$i","현장$i","","",s) }
        val lines=DailyAssistant.highlights(DailyAssistant.Briefing(sites,8))
        assertEquals(3,lines.size);assertTrue(lines[1].contains("보완"));assertTrue(lines[2].contains("검수"))
        assertFalse(lines.joinToString().contains("미제출"))
    }
    @Test fun briefingCommandWorksWithoutTodayPrefix() {
        assertEquals("briefing",AssistantRequests.parse("업무 브리핑",java.time.LocalDate.of(2026,11,7)).kind)
    }
}
