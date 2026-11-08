package kr.fieldassistant.prototype

import org.json.JSONObject
import java.math.BigDecimal

internal object NativeFinanceRules {
    fun rows(data:JSONObject,key:String):List<JSONObject> = data.optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } } ?: emptyList()
    fun eligible(data:JSONObject,client:String):List<JSONObject> {
        val sites=rows(data,"sites").filter { it.optString("client_id")==client && it.optString("status")=="completed" }
        require(sites.none { it.opt("confirmed")!=true || it.isNull("contract_amount") }) { "완료 현장의 계약금액과 기존 입금을 먼저 확인해 주세요." }
        require(sites.all { it.optString("outstanding").toBigDecimalOrNull()?.let { n->n>=BigDecimal.ZERO }==true }) { "현장 미수금 정보를 다시 확인해 주세요." }
        return sites.filter { (it.optString("outstanding").toBigDecimalOrNull() ?: BigDecimal.ZERO)>BigDecimal.ZERO }
            .sortedWith(compareBy({it.optString("schedule_start")},{it.optString("id")})).also { require(it.size<=100) { "한 번에 100현장까지 정산할 수 있습니다." } }
    }
    fun money(raw:String):Long = raw.toLongOrNull()?.takeIf { it in 0..1_000_000_000_000L } ?: error("금액은 0 이상의 정수로 입력해 주세요.")
    fun validateAllocation(total:Long,sites:List<JSONObject>,amounts:List<Long>) {
        require(total>0 && sites.size==amounts.size && amounts.sum()==total) { "배분 합계와 실제 입금액이 같아야 합니다." }
        require(sites.zip(amounts).all { (s,n)->n>=0 && n.toBigDecimal()<=s.optString("outstanding").toBigDecimal() }) { "현장별 미수금을 넘겨 배분할 수 없습니다." }
    }
    fun validateRoll(length:String,count:String,total:String):Pair<BigDecimal,Int> {
        val m=length.toBigDecimalOrNull();val n=count.toIntOrNull()
        require(m!=null && m>BigDecimal.ZERO && m<=BigDecimal(1000000) && n!=null && n in 1..50) { "롤 길이와 개수(1~50)를 확인해 주세요." }
        val sum=total.toBigDecimalOrNull()
        require(sum!=null && sum>BigDecimal.ZERO && m.multiply(n.toBigDecimal()).compareTo(sum)==0) { "롤 길이 × 개수가 확인한 총 길이와 같아야 합니다." }
        return m to n
    }
}
