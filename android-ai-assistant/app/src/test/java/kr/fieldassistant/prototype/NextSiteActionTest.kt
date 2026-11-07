package kr.fieldassistant.prototype
import org.junit.Assert.*
import org.junit.Test
class NextSiteActionTest {
 @Test fun consultationIsOwnerOnly() { assertEquals("quote",NextSiteAction.suggest("상담 중",true)?.section);assertNull(NextSiteAction.suggest("상담중",false)) }
 @Test fun preparationDependsOnRole() { assertEquals("schedule",NextSiteAction.suggest("시공예정",true)?.section);assertEquals("materials",NextSiteAction.suggest("시공예정",false)?.section) }
 @Test fun unknownAndCancelledHaveNoSuggestion() { assertNull(NextSiteAction.suggest("취소",true));assertNull(NextSiteAction.suggest("",true)) }
 @Test fun completedDoesNotAssumeUnpaid() { assertEquals("report",NextSiteAction.suggest("시공완료",true)?.section) }
}
