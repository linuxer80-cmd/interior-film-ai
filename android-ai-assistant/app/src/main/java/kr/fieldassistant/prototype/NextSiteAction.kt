package kr.fieldassistant.prototype

/** Suggestions only: opening an action revalidates access and never changes site status. */
internal object NextSiteAction {
    data class Action(val title:String,val section:String,val reason:String)
    fun suggest(status:String,owner:Boolean):Action? = when(status.replace(" ","")) {
        "상담중" -> if(owner) Action("견적 준비","quote","상담 내용을 확인하고 견적을 준비하세요.") else null
        "시공예정" -> if(owner) Action("일정 · 배정 확인","schedule","시공 전에 일정과 투입 인원을 확인하세요.") else Action("준비 자재 확인","materials","배정된 현장의 준비 자재를 확인하세요.")
        "시공중" -> Action(if(owner) "완료보고 확인" else "완료보고 작성","report",if(owner) "제출된 보고서를 확인하세요." else "작업이 끝난 뒤 사진과 작업 내용을 제출하세요.")
        "시공완료" -> Action("완료보고 보기","report","완료된 작업 기록을 확인하세요.")
        else -> null
    }
}
