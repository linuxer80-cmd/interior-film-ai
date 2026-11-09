package kr.fieldassistant.prototype

/** User-facing stages describe only work that the app actually knows about. */
internal object CallProgress {
    fun label(status: String, queued: Boolean, inFlight: Boolean): String = when (status) {
        "분석 대기" -> if (queued) "분석 대기 · 차례를 기다리고 있어요" else "분석 대기 · 다시 시도 필요"
        "휴대폰에서 분석 중" -> if (queued || inFlight) "분석 중 · 통화를 글자로 바꾸고 있어요" else "분석 상태 확인 필요"
        "내용 정리 중" -> "내용 정리 중"
        "확인 필요" -> "분석 완료 · 상담 내용 확인"
        "분석 실패" -> "분석 실패 · 다시 시도 가능"
        "현장 등록 완료" -> "현장 등록 완료"
        else -> status
    }
}
