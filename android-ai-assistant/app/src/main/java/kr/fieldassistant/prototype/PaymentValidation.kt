package kr.fieldassistant.prototype

import java.time.LocalDate

/** Validation only; saving still requires fresh server authorization and revision checks. */
internal object PaymentValidation {
    fun validate(amount:String,date:String,confirmed:Boolean,opening:String?,outstanding:Long?,today:LocalDate):String? {
        if(!amount.matches(Regex("^[0-9]{1,13}$"))) return "금액을 원 단위 숫자로 입력해 주세요."
        val value=amount.toLongOrNull() ?: return "금액을 확인해 주세요."
        if(value>1_000_000_000_000L || value<(if(confirmed) 1L else 0L)) return "금액은 허용 범위의 원 단위로 입력해 주세요."
        if(confirmed && outstanding!=null && value>outstanding) return "이번 입금액이 남은 수금액보다 큽니다."
        val day=try { LocalDate.parse(date) } catch(_:Exception) { return "실제 입금일을 YYYY-MM-DD 형식으로 입력해 주세요." }
        if(day<LocalDate.of(1900,1,1) || day>today) return "실제 입금일은 오늘 이전 날짜여야 합니다."
        if(confirmed) {
            val first=try { LocalDate.parse(opening) } catch(_:Exception) { return "기존 입금 확인일을 확인하지 못했습니다." }
            if(day<first) return "기존 입금 확인일 이후의 날짜를 입력해 주세요."
        }
        return null
    }
}
