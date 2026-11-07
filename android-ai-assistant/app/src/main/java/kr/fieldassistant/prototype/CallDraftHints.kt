package kr.fieldassistant.prototype

/** Conservative hints for review; never invent a full address or name. */
object CallDraftHints {
    fun phone(fileName: String): String = CallPhone.fromFileName(fileName)

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

    /** Extract small, clearly labelled snippets for review; never upload the full transcript. */
    fun reviewMemo(summary:String, transcript:String):String {
        val meaningful=CallSummary.field(summary,"요약")
        val schedule=CallSummary.field(summary,"희망 일정")
        val saved=listOfNotNull(meaningful.takeIf { it.isNotBlank() }?.let { "상담 요약: $it" },
            schedule.takeIf { it.isNotBlank() }?.let { "희망 일정: $it" })
        if(saved.isNotEmpty()) return saved.joinToString("\n").take(2500)

        val text=transcript.replace(Regex("\\s+")," ").trim()
        if(text.length<40) return "상담 내용을 확인한 뒤 입력해 주세요."
        val terms=Regex("견적|금액|가격|비용|만원|원정도|시공|작업|공사|싱크대|붙박이|화장대|신발장|냉장고장|방화문|문틀|몰딩|예약|방문|일정|희망|언제|다음주|이번주|오전|오후|[0-9]{1,2}월|[0-9]{1,2}일")
        val snippets=mutableListOf<String>()
        var nextAllowed=0
        for(match in terms.findAll(text)) {
            if(match.range.first<nextAllowed) continue
            val start=(match.range.first-28).coerceAtLeast(0)
            val end=(match.range.last+55).coerceAtMost(text.length)
            if(start==0 && end==text.length) continue
            val snippet=(if(start>0) "…" else "")+text.substring(start,end).trim()+(if(end<text.length) "…" else "")
            if(snippet !in snippets) snippets.add(snippet)
            nextAllowed=end
            if(snippets.size==4) break
        }
        return if(snippets.isEmpty()) "상담 내용을 확인한 뒤 입력해 주세요." else "통화 인식 발췌 · 정확도 확인 필요\n"+snippets.joinToString("\n")
    }
}
