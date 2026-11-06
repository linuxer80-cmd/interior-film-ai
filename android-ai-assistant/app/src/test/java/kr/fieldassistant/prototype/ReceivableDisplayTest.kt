package kr.fieldassistant.prototype

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ReceivableDisplayTest {
    @Test fun unknownAndUnconfirmedAmountsAreNeverShownAsZero() {
        val unknown=JSONObject().put("confirmed",false).put("paid",0).put("outstanding",0)
        assertEquals("확인 필요",ReceivableDisplay.paid(unknown))
        assertEquals("확인 필요",ReceivableDisplay.outstanding(unknown))
        val missing=JSONObject().put("confirmed",true).put("paid",JSONObject.NULL)
        assertEquals("확인 필요",ReceivableDisplay.paid(missing))
        assertEquals("확인 필요",ReceivableDisplay.outstanding(missing))
    }
    @Test fun confirmedZeroAndPositiveValuesAreClearlyDistinguished() {
        val site=JSONObject().put("confirmed",true).put("contract_amount",110000).put("paid",10000).put("outstanding",0)
        assertEquals("110,000원",ReceivableDisplay.amount(site,"contract_amount"))
        assertEquals("10,000원",ReceivableDisplay.paid(site))
        assertEquals("0원",ReceivableDisplay.outstanding(site))
    }
}
