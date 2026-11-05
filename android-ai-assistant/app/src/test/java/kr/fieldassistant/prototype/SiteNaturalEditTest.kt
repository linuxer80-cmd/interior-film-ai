package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class SiteNaturalEditTest {
    @Test fun separatesAddressAndVisitWithoutTurningVisitIntoConstructionDate() {
        val c=SiteNaturalEdit.parse("그 현장 주소는 인천 청라, 방문 견적은 토요일 오전으로 추가해 줘")!!
        assertEquals(2,c.size);assertEquals("address",c[0].key);assertEquals("인천 청라",c[0].value)
        assertEquals("memo",c[1].key);assertEquals("방문 견적: 토요일 오전",c[1].value);assertTrue(c[1].append)
    }
    @Test fun explicitNamesAndPhonesCanBeReviewed() {
        assertEquals("김민수",SiteNaturalEdit.parse("고객 이름은 김민수로 변경해줘")!!.single().value)
        assertEquals("010-1234-5678",SiteNaturalEdit.parse("전화번호는 010-1234-5678로 바꿔줘")?.single()?.value)
    }
    @Test fun noDeletesOrAmbiguousChanges() {
        assertNull(SiteNaturalEdit.parse("주소는 청라 말고 송도로 변경해줘"))
        assertNull(SiteNaturalEdit.parse("주소는 청라 방문일은 토요일로 변경해줘"))
        assertNull(SiteNaturalEdit.parse("주소는 청라, 주소는 송도로 수정해줘"))
    }
    @Test fun keepsRoadNameEndingWhenRemovingTheChangeCommand() {
        assertEquals("인천 서구 청라대로",SiteNaturalEdit.parse("주소는 인천 서구 청라대로 변경해줘")!!.single().value)
        assertEquals("인천 서구 청라대로",SiteNaturalEdit.parse("주소는 인천 서구 청라대로로 변경해줘")!!.single().value)
        assertEquals("인천 청라",SiteNaturalEdit.parse("주소는 인천 청라로 변경해줘")!!.single().value)
    }
}
