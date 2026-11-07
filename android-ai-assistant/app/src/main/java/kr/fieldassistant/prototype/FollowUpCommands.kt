package kr.fieldassistant.prototype

import java.time.LocalDate

/** Narrow intents: unrelated text, quoted requests and negations never change a consultation. */
internal object FollowUpCommands {
    data class Command(val kind:String,val stage:String?=null,val action:String?=null,val date:String?=null)
    fun parse(input:String,today:LocalDate):Command? {
        val text=input.trim().replace(Regex("\\s+"),"").trimEnd('?','!','.')
        val query=text.replace(Regex("(보여줘|알려줘|보여주세요|알려주세요|확인해줘)$"),"")
        when(query) {
            "오늘연락할고객","오늘연락할상담","연락할고객","연락할상담" -> return Command("due")
            "밀린상담","미뤄진상담","연락일지난상담" -> return Command("overdue")
            "답변기다리는상담","답변대기상담","고객답변대기" -> return Command("waiting")
            "처리할상담","내가처리할상담","상담할일" -> return Command("tasks")
            "상담브리핑","오늘상담브리핑","상담현황" -> return Command("briefing")
        }
        val command=text.replace(Regex("(해줘|해주세요|할게|할래)$"),"")
        when(command) {
            "견적보냈어","견적보냈어요","고객답변대기로바꿔줘","답변대기로바꿔줘" -> return Command("edit","waiting","wait")
            "사진요청","사진요청으로변경" -> return Command("edit","draft","photos")
            "견적작성으로변경" -> return Command("edit","draft","estimate")
            "견적보내기로변경" -> return Command("edit","draft","send")
            "상담종료","상담종료로바꿔줘" -> return Command("edit","closed")
        }
        val match=Regex("^(오늘|내일|모레|\\d{4}-\\d{2}-\\d{2})(?:다시|재)?연락(?:하기)?$").matchEntire(command) ?: return null
        val date=when(match.groupValues[1]) {
            "오늘"->today;"내일"->today.plusDays(1);"모레"->today.plusDays(2)
            else->runCatching { LocalDate.parse(match.groupValues[1]) }.getOrNull() ?: return null
        }
        return Command("edit",action="contact",date=date.toString())
    }
}
