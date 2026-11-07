package kr.fieldassistant.prototype

internal object ConsultationInput {
    fun dates(raw:String):List<String> {
        val error="연도를 포함한 실제 날짜를 입력해 주세요. 예: 2026-11-7 또는 2026/11/7"
        require(raw.length<=10000) { error }
        val parts=raw.split(",","\n").map { it.trim() }.filter { it.isNotBlank() }
        require(parts.size<=366) { "시공 날짜는 366개까지 입력할 수 있습니다." }
        return parts.map { value ->
            val normalized=value.replace(Regex("년\\s*"),"-").replace(Regex("월\\s*"),"-").removeSuffix("일").trim()
            val match=Regex("^(20[0-9]{2})([-/.])([0-9]{1,2})\\2([0-9]{1,2})$").matchEntire(normalized)
            require(match!=null) { error }
            try { java.time.LocalDate.of(match.groupValues[1].toInt(),match.groupValues[3].toInt(),match.groupValues[4].toInt()).toString() }
            catch(_:java.time.DateTimeException) { throw IllegalArgumentException(error) }
        }.distinct().sorted()
    }
    fun amount(raw:String):String {
        val value=raw.trim()
        if(value.isEmpty())return ""
        val error="금액을 확인해 주세요. 예: 250000, 250,000원, 25만원 (소수점 원 금액은 불가)"
        require(value.length<=40) { error }
        val match=Regex("^([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(\\.[0-9]+)?\\s*(만원|원)?$").matchEntire(value)
        require(match!=null && (match.groupValues[2].isEmpty() || match.groupValues[3]=="만원")) { error }
        val number=(match.groupValues[1].replace(",","")+match.groupValues[2]).toBigDecimal()
        val won=number.multiply(if(match.groupValues[3]=="만원") java.math.BigDecimal(10000) else java.math.BigDecimal.ONE)
        val whole=try {won.toBigIntegerExact()}catch(_:ArithmeticException){throw IllegalArgumentException(error)}
        require(whole.signum()>=0 && whole<=java.math.BigInteger("999999999999")) { error }
        return whole.toString()
    }
}
