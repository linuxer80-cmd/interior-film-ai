package kr.fieldassistant.prototype

import java.math.BigDecimal
import org.json.JSONObject

/** Only server-matched, available rolls with a known matching fire type are eligible. */
internal object PlannedMaterialStock {
    fun eligible(data:JSONObject?,materialId:String,type:String):List<JSONObject> {
        if(materialId.isBlank() || type !in setOf("fire","non_fire")) return emptyList()
        val rolls=data?.optJSONArray("rolls") ?: return emptyList()
        return (0 until rolls.length()).mapNotNull { rolls.optJSONObject(it) }.filter { r ->
            val ids=r.optJSONArray("matching_material_ids")
            r.optString("status")=="available" && r.optString("price_type")==type &&
                r.optString("id").isNotBlank() && r.optInt("revision",-1)>=0 &&
                (r.optString("remaining").toBigDecimalOrNull()?.let { it>BigDecimal.ZERO }==true) &&
                ids!=null && (0 until ids.length()).any { ids.optString(it)==materialId }
        }.distinctBy { it.optString("id") }
    }
    fun summary(data:JSONObject?,id:String,type:String,needed:BigDecimal?=null):String {
        if(data?.optJSONArray("rolls")==null) return "창고 재고 확인 실패 · 다시 조회해 주세요"
        if(type !in setOf("fire","non_fire")) return "방염 구분 확인 후 재고를 조회해 주세요"
        val rolls=eligible(data,id,type)
        val total=rolls.fold(BigDecimal.ZERO) { n,r -> n+r.optString("remaining").toBigDecimal() }
        val base="반출 가능한 재고 ${rolls.size}롤 · ${total.stripTrailingZeros().toPlainString()}m"
        val all=data.getJSONArray("rolls")
        val incomplete=(0 until all.length()).mapNotNull { all.optJSONObject(it) }.any { r ->
            val ids=r.optJSONArray("matching_material_ids")
            r.optString("status")=="available" && r.optString("price_type")==type && ids!=null &&
                (0 until ids.length()).any { ids.optString(it)==id } && r.optString("remaining").toBigDecimalOrNull()==null
        }
        if(incomplete) return base+" · 일부 롤 길이 확인 필요 (부족 여부 미확정)"
        if(needed==null || needed<=BigDecimal.ZERO) return base+" · 필요량 입력 시 비교"
        return base+if(total<needed) " · ${(needed-total).stripTrailingZeros().toPlainString()}m 부족" else " · 필요량 충족 (재단 손실 별도)"
    }
    fun signature(row:JSONObject):String = listOf("id","brand","product_code","product_name","film_product_id","price_type","quantity","unit","unit_price","memo").joinToString("\u001f") { row.optString(it).takeUnless { v->v=="null" }.orEmpty() }
}
