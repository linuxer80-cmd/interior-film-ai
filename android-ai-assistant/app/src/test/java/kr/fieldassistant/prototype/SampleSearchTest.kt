package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class SampleSearchTest {
    private fun product(code:String,brand:String="현대보닥",category:String="") = SampleSearch.Product("1",brand,code,"",category,"","")
    @Test fun typoAndExactCode() {
        val q=SampleSearch.parse("현다 s115보여줘")!!
        assertEquals("HYUNDAI",q.brand);assertEquals("S115",q.code)
        assertTrue(SampleSearch.matches(q,product("S115")))
        assertFalse(SampleSearch.matches(q,product("S115","영림")))
        assertFalse(SampleSearch.matches(q,product("S1150")))
    }
    @Test fun woodAndSpecificPrefixes() {
        val q=SampleSearch.parse("현대 우드패턴보여줘")!!
        assertTrue(SampleSearch.matches(q,product("W123")))
        assertTrue(SampleSearch.matches(q,product("SPW123")))
        assertFalse(SampleSearch.matches(q,product("S115")))
        assertFalse(SampleSearch.matches(q,product("SF123")))
        assertFalse(SampleSearch.matches(q,product("SL123")))
        assertFalse(SampleSearch.matches(q,product("SMT123")))
        assertFalse(SampleSearch.matches(q,product("W123","영림")))
    }
    @Test fun unrelatedAndWriteRequestsNotIntercepted() {
        assertNull(SampleSearch.parse("S115 3m 사용했어"))
        assertNull(SampleSearch.parse("현장 등록"))
        assertNull(SampleSearch.parse("새 현장 보여줘"))
        assertNull(SampleSearch.parse("S115 견적 보여줘"))
    }
    @Test fun variantsAndStoredCategories() {
        assertTrue(SampleSearch.matches(SampleSearch.parse("GSW123 보여줘")!!,product("SW123")))
        assertTrue(SampleSearch.matches(SampleSearch.parse("현대 우드 보여줘")!!,product("ZZ1",category="wood")))
        assertFalse(SampleSearch.matches(SampleSearch.parse("현대 우드 보여줘")!!,product("W1",category="solid")))
    }
}
