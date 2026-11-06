package kr.fieldassistant.prototype

import java.math.BigDecimal

internal object ReportMaterialInput {
    /** Explicit zero is allowed; blank, negative, excessive or over-precise values are not. */
    fun number(value:String):BigDecimal?=try {
        if(!Regex("^[0-9]{1,7}(\\.[0-9]{1,3})?$").matches(value)) null
        else value.toBigDecimal().takeIf { it>=BigDecimal.ZERO && it<=BigDecimal("1000000") }
    } catch(_:Exception) { null }
}
