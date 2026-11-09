package kr.fieldassistant.prototype

import org.junit.Assert.assertEquals
import org.junit.Test

class CallDraftHintsTest {
    @Test fun recognizesCommonWorkAreasWhenSpeechRecognitionAddsSpaces() {
        assertEquals("붙박이장 · 현관문 · 문틀", CallDraftHints.work("붙박이 장하고 현관 문, 문 틀 견적 부탁드려요"))
        assertEquals("팬트리장 · 엘리베이터", CallDraftHints.work("팬트리장과 엘리베이터 시공 문의"))
    }

    @Test fun doesNotTreatVisitOrQuestionAsAConstructionDoor() {
        assertEquals("", CallDraftHints.work("내일 방문해서 질문드릴게요"))
        assertEquals("싱크대 · 문짝", CallDraftHints.work("싱크대 문짝 색상 변경"))
    }
}
