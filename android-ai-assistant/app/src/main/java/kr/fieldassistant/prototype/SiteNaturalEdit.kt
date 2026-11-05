package kr.fieldassistant.prototype

/** Explicit labelled field changes only; ambiguous or destructive requests require manual editing. */
internal object SiteNaturalEdit {
    data class Change(val key:String,val value:String,val append:Boolean)
    private val label=Regex("(방문\\s*견적|고객\\s*이름|고객명|전화\\s*번호|연락처|상세\\s*주소|주소|시공\\s*내용|작업\\s*내용|메모)(?:은|는|을|를|이|가|:)\\s*")
    private val command=Regex("(?:으로|로)?\\s*(?:(?:추가|기록|입력|수정|변경|저장|등록)(?:해\\s*주세요|해주세요|해\\s*줘|해줘|해|할게|해둘게|해둬|해\\s*둬|해\\s*두세요)?|바꿔(?:줘|주세요)?|적어(?:줘|주세요)?|남겨(?:줘|주세요)?)[.!?\\s]*$")
    fun looksLikeEdit(text:String):Boolean = label.containsMatchIn(text) && command.containsMatchIn(text)
    fun parse(text:String):List<Change>? {
        if(!looksLikeEdit(text) || text.length>2000 || Regex("삭제|지워|취소|말고|아니|하지\\s*마|수정하지|변경하지").containsMatchIn(text)) return null
        val labels=label.findAll(text).toList();if(labels.isEmpty() || labels.size>6) return null
        val changes=mutableListOf<Change>();val seen=mutableSetOf<String>()
        labels.forEachIndexed { index,match ->
            val kind=match.groupValues[1].replace(Regex("\\s+"),"")
            val key=when(kind) {
                "방문견적","메모" -> "memo"
                "고객이름","고객명" -> "customer_name"
                "전화번호","연락처" -> "customer_phone"
                "상세주소" -> "address_detail"
                "주소" -> "address"
                else -> "work_description"
            }
            if(!seen.add(key)) return null
            val end=labels.getOrNull(index+1)?.range?.first ?: text.length
            var value=text.substring(match.range.last+1,end).trim().trimEnd(',', ';',' ')
            if(index==labels.lastIndex) {
                // A road name such as 청라대로 ends in 로; do not mistake it for a particle.
                val endsWithRoadName=key in listOf("address","address_detail") &&
                    Regex("(?:대로|도로)\\s*(?=(?:추가|기록|입력|수정|변경|저장|등록|바꿔|적어|남겨))").containsMatchIn(value)
                value=value.replace(command,"").trim().trimEnd(',', ';',' ')
                if(endsWithRoadName && !value.endsWith("로")) value+="로"
            }
            if(value.isBlank() || value.length>1000 || Regex("[\\r\\n]").containsMatchIn(value)) return null
            if(key=="customer_phone" && !Regex("^[+0-9() -]{8,25}$").matches(value)) return null
            if(key=="address" && Regex("(?:방문|시공|견적|일정)(?:일|은|는|을|를)").containsMatchIn(value)) return null
            val isAppend=key=="memo" || (key=="work_description" && Regex("추가|덧붙|기록|남겨").containsMatchIn(text))
            changes.add(Change(key,if(kind=="방문견적") "방문 견적: $value" else value,isAppend))
        }
        return changes
    }
}
