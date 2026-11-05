package kr.fieldassistant.prototype

/** Do not silently handle just one part of a combined expense, material and report instruction. */
internal object AssistantInputSafety {
    fun mixesWorkChanges(input:String):Boolean {
        val expense=ExpenseInput.parse(input)!=null ||
            (Regex("주차|식비|식사|유류|주유|통행료|톨비").containsMatchIn(input) && Regex("[0-9일이삼사오육칠팔구,]+\\s*(?:만|천)?원").containsMatchIn(input))
        val film=FilmInput.parse(input)!=null ||
            (Regex("(?i)(?<![A-Z0-9])[A-Z]{1,8}[0-9][A-Z0-9-]*(?![A-Z0-9])").containsMatchIn(input) && Regex("(?i)[0-9]+(?:\\.[0-9]+)?\\s*(?:m|미터|메터)").containsMatchIn(input))
        val work=Regex("완료보고|보고서|(?:작업|시공|문|싱크대|붙박이장|현장).{0,30}완료").containsMatchIn(input)
        return (expense && film) || (work && (expense || film))
    }
}
