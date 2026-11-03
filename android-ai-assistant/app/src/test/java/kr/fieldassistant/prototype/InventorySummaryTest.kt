package kr.fieldassistant.prototype

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class InventorySummaryTest {
    private fun roll(id:String,state:String,remaining:Any)=JSONObject().put("id",id).put("brand","현대").put("product_code","S115").put("status",state).put("remaining",remaining)
    private fun purchase(id:String,type:String)=JSONObject().put("roll_id",id).put("price_type",type)
    @Test fun groupsByFireTypeAndLocationWithoutCountingUnknownAsZero() {
        val rolls=JSONArray().put(roll("1","available","1.2")).put(roll("2","available","2.35")).put(roll("3","available",JSONObject.NULL)).put(roll("4","on_site","5")).put(roll("5","used_up","0"))
        val purchases=JSONArray().put(purchase("1","fire")).put(purchase("2","fire")).put(purchase("3","fire")).put(purchase("4","fire"))
        val groups=InventorySummary.groups(rolls,purchases,"s 115")
        assertEquals(2,groups.size);val stored=groups.first { it.state=="available" }
        assertEquals(3,stored.rolls.size);assertEquals("3.55",stored.metres.toPlainString());assertEquals(1,stored.unknown)
        assertEquals("5",groups.first { it.state=="on_site" }.metres.toPlainString())
        assertTrue(InventorySummary.groups(rolls,purchases,"없는제품").isEmpty())
    }
    @Test fun separatesFireTypesAndRejectsDuplicatePurchaseRecords() {
        val rolls=JSONArray().put(roll("1","available",1)).put(roll("2","available",2))
        assertEquals(2,InventorySummary.groups(rolls,JSONArray().put(purchase("1","fire")).put(purchase("2","non_fire")),"").size)
        try { InventorySummary.groups(rolls,JSONArray().put(purchase("1","fire")).put(purchase("1","fire")),"");fail("duplicate records must not be silently combined") } catch(_:IllegalStateException) { }
    }
}
