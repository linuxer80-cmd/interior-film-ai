package kr.fieldassistant.prototype

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SiteMaterialSummaryTest {
    @Test fun unknownQuantitiesRemainUnknownAndOnlyMatchingStockIsCounted() {
        val data=JSONObject().put("materials",JSONArray().put(JSONObject().put("id","m1").put("brand","현대").put("code","S115").put("issued",8).put("returned",JSONObject.NULL)))
            .put("rolls",JSONArray().put(JSONObject().put("status","available").put("remaining",10).put("matching_material_ids",JSONArray().put("m1")))
                .put(JSONObject().put("status","available").put("remaining",99).put("matching_material_ids",JSONArray().put("other"))))
            .put("trips",JSONArray().put(JSONObject().put("site_id","site1").put("product_code","S115").put("issued",8).put("returned",JSONObject.NULL))
                .put(JSONObject().put("site_id","other").put("product_code","OTHER").put("issued",5).put("returned",JSONObject.NULL)))
        val text=SiteMaterialSummary.describe(data,"site1")
        assertTrue(text.contains("반입 확인 필요"));assertTrue(text.contains("10m"));assertTrue(text.contains("방염 여부 별도 확인"));assertFalse(text.contains("99m"));assertFalse(text.contains("OTHER"))
    }
    @Test fun missingMaterialListDoesNotLookLikeEmptyList() {
        try { SiteMaterialSummary.describe(JSONObject().put("rolls",JSONArray()).put("trips",JSONArray()),"s");fail() } catch(_:Exception) { }
    }
    @Test fun repeatedMaterialNameIsShownOnceAndExtraDescriptionIsPreserved() {
        val materials=JSONArray()
            .put(JSONObject().put("brand","영림").put("code","PW975-1").put("name","영림 PW975-1"))
            .put(JSONObject().put("brand","현대").put("code","S115").put("name","현대 S115 우드"))
        val data=JSONObject().put("materials",materials).put("rolls",JSONArray()).put("trips",JSONArray())
        val text=SiteMaterialSummary.describe(data,"s")
        assertTrue(text.contains("• 영림 PW975-1 ·"))
        assertFalse(text.contains("영림 PW975-1 영림 PW975-1"))
        assertTrue(text.contains("현대 S115 우드"))
        assertTrue(text.contains("반출 확인 필요"))
        assertTrue(text.contains("창고: 같은 제품 롤 없음 또는 재고 확인 필요"))
    }
}
