package kr.fieldassistant.prototype

import org.junit.Assert.assertEquals
import org.junit.Test

class ConsultationChatTest {
    @Test fun candidateChoiceRequiresKnownTargetOrExplicitPermission() {
        assertEquals(false, ConsultationChat.canChoose(listOf("a","b"),"",false,true))
        assertEquals(false, ConsultationChat.canChoose(listOf("a","b"),"foreign",false,true))
        assertEquals(true, ConsultationChat.canChoose(listOf("a","b"),"b",false,false))
        assertEquals(false, ConsultationChat.canChoose(listOf("a"),null,true,false))
        assertEquals(true, ConsultationChat.canChoose(listOf("a"),null,true,true))
    }
    @Test fun acceptsExplicitKoreanConfirmation() {
        listOf("네", "그래", "네!", " 등록해 주세요 ", "이어서 등록해줘", "다시 시도").forEach {
            assertEquals(it, ConsultationChat.Reply.YES, ConsultationChat.reply(it))
        }
    }
    @Test fun negationAndUnclearSentencesNeverSave() {
        listOf("네 아니요", "그래도 등록하지 마", "네? 아니 취소", "현장 이름은 네모", "", "네\n취소").forEach {
            assertEquals(it, ConsultationChat.Reply.UNKNOWN, ConsultationChat.reply(it))
        }
        listOf("나중에", "보류").forEach {
            assertEquals(ConsultationChat.Reply.LATER, ConsultationChat.reply(it))
        }
    }
    @Test fun rejectionAndDeferralSurviveUpgradeAndDoNotPrompt() {
        listOf("등록안함", "등록 안 함", "아니요", "등록하지 마", "취소").forEach {
            assertEquals(ConsultationChat.Reply.DECLINE, ConsultationChat.reply(it))
            val state=ConsultationChat.disposition("",listOf("네",it))
            assertEquals("declined",state)
            assertEquals(false,ConsultationChat.shouldPrompt("확인 필요","",state))
        }
        assertEquals("deferred",ConsultationChat.disposition("",listOf("나중에","모르겠어")))
        assertEquals("declined",ConsultationChat.disposition("declined",listOf("네")))
        assertEquals("active",ConsultationChat.disposition("active",listOf("등록안함")))
        assertEquals(false,ConsultationChat.shouldPrompt("확인 필요","","deferred"))
        assertEquals(true,ConsultationChat.shouldPrompt("확인 필요","","active"))
        assertEquals(false,ConsultationChat.shouldPrompt("확인 필요","saved-site","active"))
    }
    @Test fun newSiteIsSeparateFromMergeConfirmation() {
        assertEquals(ConsultationChat.Reply.NEW, ConsultationChat.reply("새 현장으로 등록"))
        assertEquals(ConsultationChat.Reply.YES, ConsultationChat.reply("이어서 등록"))
    }
}
