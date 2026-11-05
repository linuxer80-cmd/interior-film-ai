package kr.fieldassistant.prototype

import java.time.LocalDate

/** Search only explicit, structured conditions; never infer a site's contents from a photo. */
internal object PhotoSearch {
    data class Query(val site:String="",val part:String="",val code:String="",val from:String="",val to:String="",val type:String="all")
    fun parse(input:String,today:LocalDate):Query? {
        val compact=input.replace(Regex("\\s+"),"")
        if(!compact.contains("사진") || !Regex("보여|보기|확인|찾아|검색|볼래|볼수|열어").containsMatchIn(compact) ||
            Regex("등록|추가|촬영|올려|업로드|삭제|보내|공유|샘플").containsMatchIn(compact)) return null
        val code=Regex("(?i)(?<![A-Za-z0-9])([A-Za-z]{1,5}[-]?[0-9]{2,6})(?![A-Za-z0-9])").find(input)?.value?.uppercase().orEmpty()
        val part=Regex("냉장고장|붙박이장|싱크대|현관문|방화문|화장대|신발장|문틀|몰딩|엘리베이터|문짝|중문").find(compact)?.value.orEmpty()
        val site=(Regex("([가-힣A-Za-z0-9]{2,30})\\s*현장").find(input)?.groupValues?.get(1)
            ?: Regex("([가-힣A-Za-z0-9]{2,20})에서").find(input)?.groupValues?.get(1)).orEmpty()
            .takeUnless { it in listOf("해당","지난","다른","선택한","이전","시공한","작업한") }.orEmpty()
        val range=when {
            compact.contains("지난달") || compact.contains("저번달") -> today.minusMonths(1).withDayOfMonth(1).let { it to it.withDayOfMonth(it.lengthOfMonth()) }
            compact.contains("이번달") || compact.contains("이달") -> today.withDayOfMonth(1).let { it to it.withDayOfMonth(it.lengthOfMonth()) }
            else -> null
        }
        if(site.isBlank() && part.isBlank() && code.isBlank() && range==null)return null
        val type=when { Regex("시공전|작업전").containsMatchIn(compact)->"before";Regex("시공후|완료|작업후").containsMatchIn(compact)->"after";Regex("고객요청|요청사진|상담사진").containsMatchIn(compact)->"request";else->"all" }
        return Query(site,part,code,range?.first?.toString().orEmpty(),range?.second?.toString().orEmpty(),type)
    }
}
