package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class RecordingProgressTest {
    @Test fun keepsLaterKeywordsEvenWhenTranscriptIsCompacted() {
        var p=RecordingProgress(10,20)
        repeat(20) { p=p.add("가".repeat(2000)) }
        p=p.add("시트지 문의입니다")
        repeat(20) { p=p.add("나".repeat(2000)) }
        assertTrue(p.likely);assertTrue(p.compacted);assertTrue(p.display().contains("시트지 문의"));assertTrue(p.display().length<=30000)
        assertEquals(p,RecordingProgress.restore(p.json(),10,20))
    }
    @Test fun changedFileCannotReuseThePreviousCheckpoint() {
        val p=RecordingProgress(10,20).add("아무 내용")
        assertNull(RecordingProgress.restore(p.json(),11,20));assertNull(RecordingProgress.restore(p.json(),10,21))
        assertNull(RecordingProgress.restore("{}",10,20));assertEquals(60_000_000L,p.nextUs)
    }
    @Test fun detectsKeywordAcrossAdjacentChunks() {
        val p=RecordingProgress(10,20).add("인테리어 필").add("름 문의")
        assertTrue(p.likely)
    }
}
