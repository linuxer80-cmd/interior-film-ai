package kr.fieldassistant.prototype

import java.math.BigDecimal
import org.json.JSONArray
import org.json.JSONObject

/** Read-only snapshot; missing quantities are never reported as zero or as a shortage. */
internal object SiteMaterialSummary {
    fun describe(data:JSONObject,siteId:String):String {
        val materials=data.getJSONArray("materials");val rolls=data.getJSONArray("rolls");val trips=data.getJSONArray("trips")
        fun value(o:JSONObject,k:String)=if(!o.has(k) || o.isNull(k)) "" else o.optString(k).trim()
        fun number(o:JSONObject,k:String)=value(o,k).toBigDecimalOrNull()?.takeIf { it>=BigDecimal.ZERO }
        fun qty(o:JSONObject,k:String,unit:String)=number(o,k)?.stripTrailingZeros()?.toPlainString()?.plus(unit) ?: "확인 필요"
        fun fire(o:JSONObject)=when(value(o,"price_type")) { "fire" -> "방염";"non_fire" -> "비방염";"unspecified" -> "방염 여부 미지정";else -> "방염 여부 확인 필요" }
        val lines=mutableListOf<String>()
        if(materials.length()==0) lines.add("등록된 예정 자재가 없습니다. 실제 자재 필요 여부를 현장에서 확인해 주세요.")
        for(i in 0 until minOf(materials.length(),20)) {
            val m=materials.optJSONObject(i) ?: error("자재 정보를 확인하지 못했습니다.")
            val id=value(m,"id");val unit=value(m,"unit").ifBlank { "" }
            val title=listOf(value(m,"brand"),value(m,"code"),value(m,"name")).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "자재명 확인 필요" }
            lines.add("• $title · ${fire(m)}\n  반출 ${qty(m,"issued",unit)} · 반입 ${qty(m,"returned",unit)} · 사용 ${qty(m,"used",unit)}")
            val available=(0 until rolls.length()).mapNotNull { rolls.optJSONObject(it) }.filter { roll ->
                value(roll,"status")=="available" && id.isNotBlank() && (roll.optJSONArray("matching_material_ids") ?: JSONArray()).let { ids -> (0 until ids.length()).any { ids.optString(it)==id } }
            }
            if(available.isNotEmpty()) {
                val lengths=available.map { number(it,"remaining") }
                val amount=if(lengths.any { it==null }) "길이 일부 확인 필요" else lengths.filterNotNull().fold(BigDecimal.ZERO) { sum,n -> sum.add(n) }.stripTrailingZeros().toPlainString()+"m"
                lines.add("  제품번호가 같은 창고 롤 ${available.size}개 · $amount (방염 여부 별도 확인)")
            } else lines.add("  제품번호가 같은 창고 롤 없음 또는 재고 확인 필요")
        }
        if(materials.length()>20) lines.add("자재가 더 있습니다. 현장 자재 화면에서 전체 목록을 확인해 주세요.")
        val open=(0 until trips.length()).mapNotNull { trips.optJSONObject(it) }.filter { value(it,"site_id")==siteId && it.has("returned") && it.isNull("returned") }
        if(open.isNotEmpty()) {
            lines.add("\n현장에 반출된 롤 ${open.size}개 · 반입 기록 없음")
            open.take(20).forEach { trip ->
                val name=listOf(value(trip,"brand"),value(trip,"product_code"),value(trip,"label")).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "롤 정보 확인 필요" }
                lines.add("• $name · 반출 ${qty(trip,"issued","m")}")
            }
            if(open.size>20) lines.add("반출 롤이 더 있습니다. 현장 자재 화면에서 확인해 주세요.")
        }
        lines.add("\n필요량과 재고가 충분한지는 확인 후 결정해 주세요. 조회 시점의 기록입니다.")
        return lines.joinToString("\n")
    }
}
