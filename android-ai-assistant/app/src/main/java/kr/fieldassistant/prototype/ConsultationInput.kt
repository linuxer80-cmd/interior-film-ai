package kr.fieldassistant.prototype

internal object ConsultationInput {
    fun dates(raw:String):List<String> {
        val dates=raw.split(",","\n").map { it.trim() }.filter { it.isNotBlank() }.distinct().sorted()
        require(dates.size<=366 && dates.all { it.matches(Regex("20[0-9]{2}-[0-9]{2}-[0-9]{2}")) && java.time.LocalDate.parse(it).toString()==it }) { "날짜를 YYYY-MM-DD 형식으로 확인해 주세요." }
        return dates
    }
    fun amount(raw:String):String {
        val value=raw.trim()
        require(value.isEmpty() || value.matches(Regex("[0-9]{1,12}"))) { "금액은 0 이상의 정수로 입력해 주세요." }
        return value
    }
}
