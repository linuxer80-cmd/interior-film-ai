package kr.fieldassistant.prototype

import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/** Missing or unconfirmed payment amounts must never be displayed as zero. */
internal object ReceivableDisplay {
    fun amount(row:JSONObject,key:String):String {
        val value=row.opt(key) as? Number ?: return "확인 필요"
        if(!value.toDouble().isFinite()) return "확인 필요"
        return NumberFormat.getNumberInstance(Locale.KOREA).format(value)+"원"
    }
    fun paid(row:JSONObject):String = if(row.opt("confirmed")!=true) "확인 필요" else amount(row,"paid")
    fun outstanding(row:JSONObject):String = if(row.opt("confirmed")!=true) "확인 필요" else amount(row,"outstanding")
}
