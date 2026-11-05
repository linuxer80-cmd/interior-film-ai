package kr.fieldassistant.prototype

internal object CallSummary {
    fun isEstimateInquiry(summary: String): Boolean {
        val first=summary.lineSequence().firstOrNull()?.replace("*","")?.trim().orEmpty()
        return first.matches(Regex("^시공\\s*문의\\s*가능성\\s*[:：]\\s*있음[.!]?$"))
    }
    fun field(summary: String, label: String): String {
        val line=summary.lineSequence().map { it.trim().trimStart('-', '•', '*', ' ') }
            .firstOrNull { it.startsWith("$label:") || it.startsWith("$label：") } ?: return ""
        val value=line.substringAfter(':',line.substringAfter('：',"")).trim().trim('*').take(400)
        if(value.isBlank() || listOf("확인 필요","미정","없음","불명","알 수 없음","모름").any { value.contains(it) }) return ""
        return value
    }
}
