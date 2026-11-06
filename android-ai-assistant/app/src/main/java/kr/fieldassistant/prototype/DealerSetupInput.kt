package kr.fieldassistant.prototype

import java.math.BigDecimal
import java.util.Locale

internal object DealerSetupInput {
    fun normalizedName(value:String)=value.trim().replace(Regex("\\s+"),"").uppercase(Locale.ROOT)
    fun price(value:String):BigDecimal? {
        val n=value.trim().toBigDecimalOrNull() ?: return null
        return n.takeIf { it>=BigDecimal.ZERO && it<=BigDecimal(10000000) }
    }
    fun type(position:Int)=when(position) { 1->"non_fire";2->"fire";else->null }
}
