package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class PhotoSearchTest {
    private val today=LocalDate.of(2026,11,5)
    @Test fun extractsMultipleRegisteredConditions() {
        val q=PhotoSearch.parse("지난달 시공한 싱크대 중 S115 쓴 현장 사진 보여줘",today)!!
        assertEquals("싱크대",q.part);assertEquals("S115",q.code)
        assertEquals("2026-10-01",q.from);assertEquals("2026-10-31",q.to)
        assertEquals("",q.site)
    }
    @Test fun searchesSiteByName() {
        assertEquals("청라",PhotoSearch.parse("청라 현장 사진 찾아줘",today)?.site)
        assertEquals("before",PhotoSearch.parse("청라 현장 시공 전 사진 보여줘",today)?.type)
    }
    @Test fun leavesCurrentGalleryAndMutatingRequestsAlone() {
        assertNull(PhotoSearch.parse("그 현장 시공 전 사진 보여줘",today))
        assertNull(PhotoSearch.parse("싱크대 사진 삭제해줘",today))
        assertNull(PhotoSearch.parse("현대 S115 샘플 보여줘",today))
    }
}
