package kr.fieldassistant.prototype

import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.math.BigDecimal

class PlannedMaterialStockTest {
    private fun roll(id:String="r",type:String="fire",status:String="available",remaining:Any=12.5,material:String="m")=JSONObject().put("id",id).put("price_type",type).put("status",status).put("remaining",remaining).put("revision",1).put("matching_material_ids",JSONArray(listOf(material)))
    @Test fun excludesWrongVariantOtherMaterialAndUnavailableStock() {
        val stock=JSONObject().put("rolls",JSONArray(listOf(roll(),roll("other","non_fire"),roll("busy",status="on_site"),roll("wrong",material="other"),roll("empty",remaining=0))))
        assertEquals(listOf("r"),PlannedMaterialStock.eligible(stock,"m","fire").map { it.getString("id") })
        assertTrue(PlannedMaterialStock.summary(stock,"m","fire",BigDecimal("20")).contains("7.5m 부족"))
        assertTrue(PlannedMaterialStock.summary(stock,"m","fire",BigDecimal("12.5")).contains("충족"))
    }
    @Test fun unknownNeverBecomesZeroAndDuplicatesAreNotCountedTwice() {
        assertTrue(PlannedMaterialStock.summary(null,"m","fire").contains("확인 실패"))
        assertTrue(PlannedMaterialStock.summary(JSONObject(),"m","fire").contains("확인 실패"))
        assertTrue(PlannedMaterialStock.summary(JSONObject().put("rolls",JSONArray(listOf(roll(remaining="?")))),"m","fire",BigDecimal("20")).contains("미확정"))
        val stock=JSONObject().put("rolls",JSONArray(listOf(roll(),roll())))
        assertEquals(1,PlannedMaterialStock.eligible(stock,"m","fire").size)
        assertTrue(PlannedMaterialStock.summary(stock,"m","unspecified").contains("방염 구분"))
    }
    @Test fun signatureDetectsProductAndPriceChanges() {
        val original=JSONObject().put("id","m").put("product_code","S115").put("unit_price",4500)
        assertNotEquals(PlannedMaterialStock.signature(original),PlannedMaterialStock.signature(JSONObject(original.toString()).put("unit_price",5000)))
        assertNotEquals(PlannedMaterialStock.signature(original),PlannedMaterialStock.signature(JSONObject(original.toString()).put("product_code","S116")))
    }
}
