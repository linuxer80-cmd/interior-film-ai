package kr.fieldassistant.prototype

import java.math.BigDecimal
import java.util.Locale

/** Only explicit product codes and a single positive length are accepted. */
internal object FilmInput {
    data class Usage(val code:String,val metres:BigDecimal)
    fun parse(message:String):Usage? {
        if(Regex("취소|말고|안\\s*(썼|써|쓸|사용)|사용\\s*(안|하지|못)|쓰지|미사용|반출|반납|남았|남은|잔량|필요").containsMatchIn(message)) return null
        if(!Regex("사용|썼|써").containsMatchIn(message) || Regex("사용할|사용 예정|쓸\\s*예정").containsMatchIn(message)) return null
        val codes=Regex("(?i)(?<![A-Z0-9])(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*[0-9])[A-Z0-9]+(?:-[A-Z0-9]+)*(?![A-Z0-9])").findAll(message).map { it.value.uppercase(Locale.ROOT) }.filterNot { Regex("[0-9]+M").matches(it) }.distinct().toList()
        val values=Regex("(?<![0-9.])([0-9]+(?:\\.[0-9]{1,3})?)\\s*(?:미터|메터|m)(?![A-Za-z])",RegexOption.IGNORE_CASE).findAll(message).toList()
        if(codes.size!=1 || values.size!=1) return null
        val value=values.single().groupValues[1].toBigDecimalOrNull() ?: return null
        if(value<=BigDecimal.ZERO || value>BigDecimal("1000000")) return null
        return Usage(codes.single(),value.stripTrailingZeros())
    }
}
