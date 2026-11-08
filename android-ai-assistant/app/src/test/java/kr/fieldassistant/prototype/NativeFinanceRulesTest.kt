package kr.fieldassistant.prototype
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
class NativeFinanceRulesTest {
    private fun site(id:String,amount:Int)=JSONObject().put("id",id).put("client_id","a").put("status","completed").put("confirmed",true).put("contract_amount",amount).put("outstanding",amount)
    @Test fun allocationsMustMatchActualPaymentAndCannotExceedSiteBalance(){
        val sites=listOf(site("1",100),site("2",200))
        NativeFinanceRules.validateAllocation(150,sites,listOf(100,50))
        for(values in listOf(listOf(100L,40L),listOf(101L,49L),listOf(-1L,151L))) {
            assertTrue(runCatching { NativeFinanceRules.validateAllocation(150,sites,values) }.isFailure)
        }
        assertTrue(runCatching { NativeFinanceRules.money("1.5") }.isFailure)
    }
    @Test fun onlySelectedClientCompletedConfirmedSitesAreEligible(){
        val data=JSONObject().put("sites",JSONArray().put(site("1",100)).put(site("2",200).put("client_id","b")).put(site("3",100).put("status","consulting")))
        assertEquals(listOf("1"),NativeFinanceRules.eligible(data,"a").map{it.getString("id")})
        data.getJSONArray("sites").put(site("4",100).put("confirmed",false))
        assertTrue(runCatching{NativeFinanceRules.eligible(data,"a")}.isFailure)
    }
    @Test fun receiptTotalMustMatchExplicitRollConfiguration(){
        assertEquals(2,NativeFinanceRules.validateRoll("12.5","2","25").second)
        for(input in listOf(listOf("25","","25"),listOf("12.5","2","30"),listOf("0","1","0"),listOf("1","51","51"))) {
            assertTrue(runCatching { NativeFinanceRules.validateRoll(input[0],input[1],input[2]) }.isFailure)
        }
    }
}
