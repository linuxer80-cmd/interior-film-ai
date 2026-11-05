package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class FilmInputTest {
    @Test fun recognizesOneCodeAndLength() {
        assertEquals("S115",FilmInput.parse("S115 3미터 썼어")?.code)
        assertEquals("3.5",FilmInput.parse("s115 3.5m 사용")?.metres?.toPlainString())
    }
    @Test fun rejectsUnclearOrPotentiallyDifferentOperations() {
        assertNull(FilmInput.parse("S115 3m 반출"))
        assertNull(FilmInput.parse("S115 3m 반납"))
        assertNull(FilmInput.parse("S115 3m 취소"))
        assertNull(FilmInput.parse("S115 3m 4m 사용"))
        assertNull(FilmInput.parse("S115 W123 3m 사용"))
        assertNull(FilmInput.parse("S115 0m 사용"))
        assertNull(FilmInput.parse("S115 3m 남았어"))
        assertNull(FilmInput.parse("S115 3m 필요해"))
        assertNull(FilmInput.parse("S115 3m 사용하지 않았어"))
        assertNull(FilmInput.parse("S115 3m 안 썼어"))
        assertNull(FilmInput.parse("S115 3m"))
        assertNull(FilmInput.parse("S115 3m 쓸 거야"))
        assertNull(FilmInput.parse("S115 3m 사용할 예정"))
    }
}
