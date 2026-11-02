package kr.fieldassistant.prototype

/** Parse only explicit amounts; ambiguous text is returned for clarification. */
internal object ExpenseInput {
    data class Expense(val type:String,val label:String,val amount:Long)
    fun parse(message:String):Expense? {
        val text=message.replace(Regex("\\s+"),"")
        val category=when {
            text.contains("주차") -> "parking" to "주차비"
            text.contains("식비") || text.contains("식사") -> "meal" to "식비"
            text.contains("유류") || text.contains("주유") -> "fuel" to "유류비"
            text.contains("통행료") || text.contains("톨비") -> "toll" to "통행료"
            else -> return null
        }
        val amounts=Regex("(?<![0-9일이삼사오육칠팔구만천])([0-9][0-9,]*|[일이삼사오육칠팔구])(만|천)?원").findAll(text).toList()
        if(amounts.size!=1) return null
        val digits=mapOf("일" to 1L,"이" to 2L,"삼" to 3L,"사" to 4L,"오" to 5L,"육" to 6L,"칠" to 7L,"팔" to 8L,"구" to 9L)
        val number=amounts.single().groupValues[1].replace(",","")
        val raw=number.toLongOrNull() ?: digits[number] ?: return null
        val multiplier=when(amounts.single().groupValues[2]) { "만" -> 10000L;"천" -> 1000L;else -> 1L }
        if(raw<=0 || raw>100000000L/multiplier) return null
        return Expense(category.first,category.second,raw*multiplier)
    }
}
