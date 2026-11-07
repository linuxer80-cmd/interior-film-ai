package kr.fieldassistant.prototype
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class QuoteReuseTest {
 private fun source()=JSONObject("""{"customer_name":"Private customer","items":[{"name":"Door","quantity":"3","unit_price":"120000","note":"Private note","site_id":"private"}]}""")
 @Test fun copiesOnlyReusableFields() { val original=source();val row=QuoteReuse.items(original,false).getJSONObject(0);assertEquals("3",row.getString("quantity"));assertEquals("120000",row.getString("unit_price"));assertEquals("",row.getString("note"));assertFalse(row.has("site_id"));assertFalse(row.has("customer_name"));row.put("name","Changed");assertEquals("Door",original.getJSONArray("items").getJSONObject(0).getString("name")) }
 @Test fun blankQuantityLeavesPriceIntact() { val row=QuoteReuse.items(source(),true).getJSONObject(0);assertEquals("",row.getString("quantity"));assertEquals("120000",row.getString("unit_price")) }
 @Test(expected=IllegalArgumentException::class) fun rejectsEmptyQuote() { QuoteReuse.items(JSONObject("""{"items":[]}"""),false) }
}
