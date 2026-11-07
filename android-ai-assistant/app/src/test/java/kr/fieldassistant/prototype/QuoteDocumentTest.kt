package kr.fieldassistant.prototype
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
class QuoteDocumentTest {
    private fun doc(q:String="1.5",p:String="1001")=JSONObject().put("vat","separate").put("customer_name","홍길동").put("items",JSONArray().put(JSONObject().put("name","문").put("detail","문틀 포함").put("quantity",q).put("unit_price",p)))
    @Test fun usesRoundedLineAmountsWithoutSilentlyAddingVat(){val text=QuoteDocument.text(doc());assertTrue(text.contains("견적금액: 1,502원 · 부가세 별도"));assertTrue(text.contains("홍길동"));assertTrue(text.contains("문틀 포함"))}
    @Test fun blankAmountRemainsDraft(){assertTrue(QuoteDocument.text(doc(p="")).contains("견적금액: 작성 중"))}
    @Test fun includedTaxAndZeroPriceArePreserved(){assertTrue(QuoteDocument.text(doc(p="0").put("vat","included")).contains("견적금액: 0원 · 부가세 포함"))}
    @Test fun multilineCustomerNotesNotLost(){val note="사진 확인\n긴 안내 ".repeat(200);assertTrue(QuoteDocument.text(doc().put("customer_note",note)).contains(note))}
}
