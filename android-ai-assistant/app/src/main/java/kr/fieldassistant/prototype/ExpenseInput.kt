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
        val amounts=Regex("(?<![0-9])([0-9][0-9,]*)(만)?원").findAll(text).toList()
        if(amounts.size!=1) return null
        val raw=amounts.single().groupValues[1].replace(",","").toLongOrNull() ?: return null
        val multiplier=if(amounts.single().groupValues[2]=="만") 10000L else 1L
        if(raw<=0 || raw>100000000L/multiplier) return null
        return Expense(category.first,category.second,raw*multiplier)
    }
}
