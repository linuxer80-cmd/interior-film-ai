package kr.fieldassistant.prototype

import java.math.BigDecimal
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

internal object InventorySummary {
    data class Group(val brand:String,val code:String,val kind:String,val state:String,val rolls:List<JSONObject>,val metres:BigDecimal,val unknown:Int)
    fun groups(rolls:JSONArray,purchases:JSONArray,query:String):List<Group> {
        fun value(row:JSONObject,key:String)=row.optString(key).takeUnless { it.isBlank() || it=="null" }.orEmpty()
        fun normalized(s:String)=s.filterNot { it.isWhitespace() }.uppercase(Locale.ROOT)
        val purchaseByRoll=mutableMapOf<String,JSONObject>()
        for(i in 0 until purchases.length()) { val row=purchases.optJSONObject(i) ?: error("입고 정보를 확인하지 못했습니다.");val id=value(row,"roll_id");if(id.isNotEmpty()) check(purchaseByRoll.put(id,row)==null) { "중복 입고 정보를 확인해 주세요." } }
        data class Key(val brand:String,val code:String,val kind:String,val state:String)
        val buckets=linkedMapOf<Key,MutableList<JSONObject>>()
        val search=normalized(query)
        for(i in 0 until rolls.length()) {
            val row=rolls.optJSONObject(i) ?: error("재고 정보를 확인하지 못했습니다.")
            val state=value(row,"status");if(state !in listOf("available","on_site")) continue
            val purchase=purchaseByRoll[value(row,"id")]
            val brand=value(row,"brand").ifBlank { "브랜드 확인 필요" };val code=value(row,"product_code").ifBlank { "제품번호 확인 필요" }
            val kind=purchase?.let { value(it,"price_type") }?.takeIf { it in listOf("fire","non_fire","unspecified") } ?: "unknown"
            val haystack=listOf(brand,code,value(row,"location"),value(row,"supplier"),value(row,"site_name"),purchase?.let { value(it,"product_name") }.orEmpty()).joinToString(" ")
            if(search.isNotEmpty() && !normalized(haystack).contains(search)) continue
            buckets.getOrPut(Key(brand,code,kind,state)){ mutableListOf() }.add(row)
        }
        return buckets.map { (key,items) ->
            var total=BigDecimal.ZERO;var unknown=0
            for(row in items) { val n=value(row,"remaining").toBigDecimalOrNull();if(n==null || n<BigDecimal.ZERO) unknown++ else total=total.add(n) }
            Group(key.brand,key.code,key.kind,key.state,items,total,unknown)
        }.sortedWith(compareBy<Group>({it.brand},{it.code},{it.kind},{it.state}))
    }
}
