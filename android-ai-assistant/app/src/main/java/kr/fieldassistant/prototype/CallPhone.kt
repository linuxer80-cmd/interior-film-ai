package kr.fieldassistant.prototype

/** Normalize complete, unambiguous Korean contact numbers only. */
internal object CallPhone {
    private val domestic=Regex("0(?:1[016789][0-9]{7,8}|2[0-9]{7,8}|(?:3[1-3]|4[1-4]|5[1-5]|6[1-4]|70|80)[0-9]{7,8})")
    fun normalize(raw:String):String {
        val text=raw.trim()
        if(text.isEmpty() || !text.matches(Regex("[+0-9\\s().-]+"))) return ""
        val compact=text.replace(Regex("[\\s().-]"),"")
        val national=when {
            compact.startsWith("+82") -> compact.removePrefix("+82").let { if(it.startsWith('0')) it else "0$it" }
            compact.startsWith("0082") -> compact.removePrefix("0082").let { if(it.startsWith('0')) it else "0$it" }
            else -> compact
        }
        return national.takeIf { domestic.matches(it) }.orEmpty()
    }
    fun fromFileName(name:String):String {
        val separator="[\\s().-]*"
        val body="(?:1[016789]|2|3[1-3]|4[1-4]|5[1-5]|6[1-4]|70|80)$separator[0-9]{3,4}$separator[0-9]{4}"
        val pattern=Regex("(?<![0-9+])(?:0|(?:\\+82|0082)$separator(?:0$separator)?)$body(?![0-9])")
        val numbers=pattern.findAll(name.take(2048)).map { normalize(it.value) }.filter { it.isNotBlank() }.distinct().take(2).toList()
        return numbers.singleOrNull().orEmpty()
    }
}
