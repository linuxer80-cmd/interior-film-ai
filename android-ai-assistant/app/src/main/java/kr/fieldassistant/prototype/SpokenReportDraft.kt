package kr.fieldassistant.prototype

/** Keep spoken quantities intact: these notes never mutate stock or expense records. */
internal object SpokenReportDraft {
    data class Draft(val work:String,val notes:String) {
        fun preview()="작업 내용\n${work.ifBlank { "작업 내용을 추가해 주세요." }}\n\n확인할 메모\n${notes.ifBlank { "없음" }}"
    }
    fun parse(input:String):Draft {
        val work=mutableListOf<String>();val notes=mutableListOf<String>()
        input.trim().split(Regex("[,，;\\n]+|(?<=[요다])\\s*\\.(?:\\s+|$)")).map { it.trim() }.filter { it.isNotBlank() }.forEach { part ->
            val expense=Regex("주차|교통비|식비|경비|택시|영수증|비용").containsMatchIn(part)
            val material=Regex("필름|자재|반출|반납|반입|사용량").containsMatchIn(part)
            if((expense || material) && Regex("시공|완료|작업|보수|마감").containsMatchIn(part)) work.add(part)
            when {
                expense && material -> notes.add("[자재·경비 확인] $part")
                expense -> notes.add("[경비 확인] $part")
                material -> notes.add("[자재 확인] $part")
                else -> work.add(part)
            }
        }
        return Draft(work.joinToString("\n"),notes.joinToString("\n"))
    }
}
