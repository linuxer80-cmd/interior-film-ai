package kr.fieldassistant.prototype

import org.json.JSONObject

/** Limits native submission to new reports whose materials are already tracked. */
internal object ReportSubmissionGate {
    fun problem(access:JSONObject,support:JSONObject):String? {
        if(!access.optBoolean("canSubmit")) return "책임 팀장 또는 지정 담당자만 제출할 수 있습니다."
        if(!access.has("report") || !access.isNull("report") || !support.has("report") || !support.isNull("report")) return "기존 보고서 상태를 확인해 주세요. 기존 보고서 화면에서 작성할 수 있습니다."
        val operations=support.optJSONObject("operations") ?: return "현장 자재 상태를 확인하지 못했습니다."
        val materials=operations.optJSONArray("materials") ?: return "현장 자재 상태를 확인하지 못했습니다."
        val seed=support.optJSONObject("seed") ?: return "기존 비용을 확인하지 못했습니다."
        if(!operations.has("locked") || operations.optBoolean("locked",true)) return "현장 상태가 변경되었습니다. 다시 확인해 주세요."
        if(support.optInt("afterCount",0)<=0) return "시공 완료 사진을 먼저 등록해 주세요."
        if(materials.length()==0) return "지정 자재가 없는 현장은 수동 자재 확인이 필요합니다. 기존 보고서 화면에서 작성해 주세요."
        if(materials.length()>100) return "자재 내역이 많아 기존 보고서 화면에서 확인해 주세요."
        if((0 until materials.length()).any { materials.optJSONObject(it)?.let { row -> row.has("returned") && !row.isNull("returned") }!=true }) return "자재 반납량 또는 사용 여부를 먼저 확인해 주세요."
        if(seed.optJSONArray("expenses")?.length()!=0 || seed.optJSONArray("labor")?.length()!=0 || seed.optJSONArray("materials")?.length()!=0) return "기존 실자재 또는 완료보고 비용이 있어 기존 화면에서 확인해야 합니다."
        return null
    }
}
