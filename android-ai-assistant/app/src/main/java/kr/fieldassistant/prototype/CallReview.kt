package kr.fieldassistant.prototype

import java.util.Locale

/** Evidence for a person to review, not an assertion of recognition confidence. */
internal object CallReview {
    fun phone(value:String):String = CallPhone.normalize(value)
    fun samePhone(left:String,right:String):Boolean {
        val a=phone(left);return a.isNotEmpty() && a==phone(right)
    }
    fun selectedTarget(id:String,selectedPhone:String,currentPhone:String):String? =
        id.takeIf { Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").matches(it) && samePhone(selectedPhone,currentPhone) }
    data class Evidence(val dates:List<String>,val codes:List<String>,val amounts:List<String>)
    fun evidence(transcript:String):Evidence {
        val text=transcript.take(30000)
        fun values(pattern:Regex)=pattern.findAll(text).map { it.value.trim() }.distinct().take(5).toList()
        val dates=values(Regex("(?:20[0-9]{2}[-./년]\\s*)?[0-9]{1,2}\\s*월\\s*[0-9]{1,2}\\s*일|20[0-9]{2}[-./][0-9]{1,2}[-./][0-9]{1,2}|다음\\s*주|이번\\s*주|내일|모레|[월화수목금토일]요일"))
        val codes=values(Regex("(?i)(?<![A-Za-z0-9])[A-Za-z]{1,5}[-]?[0-9]{2,6}(?![A-Za-z0-9])")).map { it.uppercase(Locale.ROOT) }.distinct()
        val amounts=values(Regex("(?<![0-9])[0-9][0-9,]*(?:\\s*(?:억|천|백|십))?\\s*(?:만\\s*)?원(?![가-힣])|(?<![0-9])[0-9][0-9,]*\\s*만원"))
        return Evidence(dates,codes,amounts)
    }
}
