package kr.fieldassistant.prototype

import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode

internal object QuoteDocument {
    fun text(doc:JSONObject):String {
        fun value(row:JSONObject,key:String)=row.optString(key).takeUnless{it=="null"}.orEmpty()
        fun money(n:BigDecimal)=java.text.DecimalFormat("#,##0").format(n)
        val lines=mutableListOf(value(doc,"title").ifBlank{"인테리어필름 시공 견적서"},"")
        listOf("company_name" to "업체","business_number" to "사업자번호","company_phone" to "업체 연락처","customer_name" to "고객","customer_phone" to "고객 연락처","address" to "현장 주소","work_date" to "시공일","duration" to "시공 기간").forEach{(k,l)->value(doc,k).takeIf{it.isNotBlank()}?.let{lines.add("$l: $it")}}
        lines.add("");val items=doc.optJSONArray("items");var total=BigDecimal.ZERO;var complete=items!=null&&items.length()>0
        for(i in 0 until (items?.length()?:0)){
            val r=items!!.getJSONObject(i);val qty=value(r,"quantity").toBigDecimalOrNull();val price=value(r,"unit_price").toBigDecimalOrNull()
            val amount=if(qty!=null&&price!=null&&qty.signum()>=0&&price.signum()>=0)qty.multiply(price).setScale(0,RoundingMode.HALF_UP)else null
            if(amount==null)complete=false else total=total.add(amount)
            lines.add("${i+1}. ${value(r,"name")}")
            listOf("detail" to "상세","film_no" to "제품번호","note" to "비고").forEach{(k,l)->value(r,k).takeIf{it.isNotBlank()}?.let{lines.add("$l: $it")}}
            lines.add("수량: ${value(r,"quantity").ifBlank{"미정"}} ${value(r,"unit")} / 단가: ${price?.let{money(it)+"원"}?:"미정"}")
            lines.add("금액: ${amount?.let{money(it)+"원"}?:"작성 중"}");lines.add("")
        }
        val vat=when(value(doc,"vat")){"separate"->"부가세 별도 · 10%";"included"->"부가세 포함";else->"부가세 없음"}
        lines.add("견적금액: ${if(complete)money(total)+"원" else "작성 중"} · $vat")
        if(!complete)lines.add("수량과 단가를 모두 입력하면 합계가 확정됩니다.")
        listOf("customer_note" to "고객 안내","other_schedule" to "기타 일정","footer" to "안내").forEach{(k,l)->value(doc,k).takeIf{it.isNotBlank()}?.let{lines.add("\n$l\n$it")}}
        return lines.joinToString("\n")
    }
}
