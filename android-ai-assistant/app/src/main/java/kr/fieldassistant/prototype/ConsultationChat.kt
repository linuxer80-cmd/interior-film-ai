package kr.fieldassistant.prototype

/** Explicit confirmation only: unrecognised sentences never trigger a write. */
object ConsultationChat {
    fun canChoose(ids: List<String>, target: String?, createNew: Boolean, allowNew: Boolean): Boolean =
        if(createNew) allowNew && target==null else !target.isNullOrBlank() && target in ids

    /** Persisted disposition takes precedence; legacy replies are recovered on upgrade. */
    fun disposition(saved: String, userReplies: List<String>): String {
        if(saved in listOf("active", "deferred", "declined")) return saved
        for(input in userReplies.asReversed()) when(reply(input)) {
            Reply.DECLINE -> return "declined"
            Reply.LATER -> return "deferred"
            Reply.YES, Reply.NEW -> return "active"
            else -> Unit
        }
        return "active"
    }
    fun shouldPrompt(status: String, siteId: String, disposition: String): Boolean =
        status=="확인 필요" && siteId.isBlank() && disposition=="active"

    enum class Reply { YES, LATER, DECLINE, NEW, UNKNOWN }
    fun reply(input: String): Reply {
        val value = input.trim().replace(Regex("[\\s.!?。！？,]+"), "")
        return when(value) {
            "네", "예", "응", "그래", "그래요", "좋아", "좋아요", "등록", "등록해", "등록해줘", "등록해주세요", "이어서등록", "이어서등록해줘", "확인", "다시시도" -> Reply.YES
            "나중에", "보류", "나중에할게", "나중에등록", "나중에등록할게" -> Reply.LATER
            "아니", "아니요", "취소", "등록안함", "등록안해", "등록안할게", "등록하지마", "등록하지마세요", "등록하지않음", "등록안해도돼", "필요없어", "견적문의아님" -> Reply.DECLINE
            "새현장", "새현장으로등록" -> Reply.NEW
            else -> Reply.UNKNOWN
        }
    }
}
