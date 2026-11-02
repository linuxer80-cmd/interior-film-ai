package kr.fieldassistant.prototype

/** Explicit confirmation only: unrecognised sentences never trigger a write. */
object ConsultationChat {
    fun canChoose(ids: List<String>, target: String?, createNew: Boolean, allowNew: Boolean): Boolean =
        if(createNew) allowNew && target==null else !target.isNullOrBlank() && target in ids

    enum class Reply { YES, LATER, NEW, UNKNOWN }
    fun reply(input: String): Reply {
        val value = input.trim().replace(Regex("[\\s.!?。！？,]+"), "")
        return when(value) {
            "네", "예", "응", "그래", "그래요", "좋아", "좋아요", "등록", "등록해", "등록해줘", "등록해주세요", "이어서등록", "이어서등록해줘", "확인", "다시시도" -> Reply.YES
            "아니", "아니요", "나중에", "취소", "보류" -> Reply.LATER
            "새현장", "새현장으로등록" -> Reply.NEW
            else -> Reply.UNKNOWN
        }
    }
}
