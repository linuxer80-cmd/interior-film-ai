package kr.fieldassistant.prototype

/** Normalize common phrasing locally; never execute a write operation. */
internal object NaturalLanguage {
    fun normalize(input:String):String {
        var value=input.trim()
        val rules=listOf(
            "보여\\s*줄\\s*수\\s*(?:있을까요|있을까|있나요|있어)" to "보여줘",
            "알려\\s*줄\\s*수\\s*(?:있을까요|있을까|있나요|있어)" to "알려줘",
            "(?:확인|조회)\\s*(?:해\\s*줄래|해\\s*주세요|해\\s*줘|해봐)" to "보여줘",
            "보여\\s*줄래(?:요)?" to "보여줘",
            "알려\\s*줄래(?:요)?" to "알려줘",
            "찾아\\s*줄래(?:요)?" to "찾아줘",
            "(?:돈\\s*)?얼마나?\\s*벌었(?:어|나요|는지)?" to "수익",
            "(?:안\\s*받은|못\\s*받은|받을\\s*돈|미입금|입금\\s*안\\s*된)" to "미수금",
            "(?:남은|가지고\\s*있는)\\s*(?:필름|자재)" to "필름 재고",
            "(?:고객|손님)(?:과의|이랑|하고)?\\s*(?:대화|메시지|문자)" to "고객채팅",
            "(?:부탁해요|부탁드립니다|부탁해|좀|한번|한\\s*번)" to " "
        )
        for((pattern,replacement) in rules) value=value.replace(Regex(pattern),replacement)
        return value.replace(Regex("\\s+")," ").trim()
    }

    fun siteQuery(input:String):String {
        val before=input.substringBefore("현장", "").trim()
        val generic=Regex("^(?:우리|내|제|저희|모든|전체|최근|새로|방금|아까|지난번|등록한|저장한|그|이|해당|그쪽|그거|어떤|어느|어디|지금|혹시|다시|목록|리스트|목록을|목록이|보여줘|알려줘|찾아줘|찾아|검색|찾기|확인|어떻게|있는|있어|있나요|있을까|뭐|뭐야|다|전부)*$")
        val prefix=before.replace(Regex("^(?:(?:혹시|우리|저희|제가|저|그|이|해당|지난번|방금|아까|등록한|저장한)\\s+)+"),"").trim()
        if(prefix.isNotBlank() && !generic.matches(prefix.replace(" ",""))) return prefix
        val after=input.substringAfter("현장", "")
            .replace(Regex("(?:목록|리스트|찾아줘|찾아주세요|찾기|찾아|알려줘|알려주세요|보여줘|보여주세요|검색해줘|검색|확인해줘|확인|상세|주소|정보|어디에|어디야|어디|있나요|있어|있을까|어떤게|뭐가|뭐야|전부|모두|전체|있니|있나)")," ")
            .replace(Regex("[?.!]+")," ").trim().replace(Regex("(?:을|를)$"),"").trim()
        return if(generic.matches(after.replace(" ",""))) "" else after
    }
}
