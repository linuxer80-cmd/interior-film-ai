package kr.fieldassistant.prototype

import java.math.BigDecimal
import java.util.Locale

internal object FilmRollDecision {
    data class Roll(val siteId:String,val rollId:String,val code:String,val issued:BigDecimal,val revision:Int,val returned:Boolean,val label:String)
    data class Proposal(val roll:Roll,val used:BigDecimal,val remaining:BigDecimal)
    fun propose(siteId:String,code:String,used:BigDecimal,rolls:List<Roll>):Proposal? {
        if(used<=BigDecimal.ZERO) return null
        val matches=rolls.filter { !it.returned && it.siteId==siteId && it.code.trim().uppercase(Locale.ROOT)==code.trim().uppercase(Locale.ROOT) }
        val roll=matches.singleOrNull() ?: return null
        if(roll.issued<used || roll.issued<=BigDecimal.ZERO || roll.revision<0) return null
        return Proposal(roll,used,roll.issued.subtract(used).stripTrailingZeros())
    }
}
