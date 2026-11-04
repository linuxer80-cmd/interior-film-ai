package kr.fieldassistant.prototype

/** Conservative hints for review; never invent a full address or name. */
object CallDraftHints {
    fun phone(fileName: String): String {
        val match = Regex("(?<![0-9])01[016789][ -]?[0-9]{3,4}[ -]?[0-9]{4}(?![0-9])").find(fileName) ?: return ""
        return match.value.filter { it.isDigit() }
    }

    fun area(transcript: String): String {
        val text = transcript.replace(Regex("\\s+"), " ")
        val cue = Regex("(?:지역|어디|주소).{0,60}?(?:여기는|여기|지역은|주소는)\\s*([가-힣]{2,12})(?=[, .!?]|$)").find(text)
        val candidate = cue?.groupValues?.get(1).orEmpty()
        if (candidate.isNotBlank() && candidate !in setOf("저희는", "경기도", "여기는", "어디세요")) return candidate
        return ""
    }

    fun work(transcript: String): String {
        val names = listOf("화장대", "신발장", "붙박이장", "냉장고장", "싱크대", "방화문", "중문", "몰딩", "문틀")
        return names.filter { transcript.contains(it) }.joinToString(" · ")
    }
}
