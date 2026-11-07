package kr.fieldassistant.prototype

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeWorkflowTest {
    @Test fun workflowsStayNativeAndRespectManagerAccess() {
        for(id in listOf("quotes","assignment","payment")) {
            assertNotNull(AssistantRequests.feature(id,true))
            assertNull(AssistantRequests.feature(id,false))
            assertFalse(AssistantRequests.opensWeb(id))
            assertNotNull(NativeWorkflow.action(id))
        }
        for(id in listOf("report","expenses","film-use")) {
            assertNotNull(AssistantRequests.feature(id,false))
            assertFalse(AssistantRequests.opensWeb(id))
            assertNotNull(NativeWorkflow.action(id))
        }
        assertNull(NativeWorkflow.action("delete"))
        assertTrue(AssistantRequests.opensWeb("cutting"))
    }
    @Test fun searchCombinesNameCustomerAndAddressWithoutNullValues() {
        val site=JSONObject().put("site_name","청라 아파트").put("customer_name","김고객").put("address","인천 서구").put("address_detail",JSONObject.NULL)
        assertTrue(NativeWorkflow.matches(site,"  청라   김고객 "))
        assertTrue(NativeWorkflow.matches(site,"인천"))
        assertTrue(NativeWorkflow.matches(site,""))
        assertFalse(NativeWorkflow.matches(site,"서울"))
        assertFalse(NativeWorkflow.matches(site,"null"))
    }
    @Test fun phoneSearchNormalizesFormattingAndRequiresFourDigits() {
        val site=JSONObject().put("site_name","청라").put("customer_phone","010-1234-5678")
        assertTrue(NativeWorkflow.matches(site,"청라 5678"))
        assertTrue(NativeWorkflow.matches(site,"01012345678"))
        assertFalse(NativeWorkflow.matches(site,"서울 5678"))
        assertFalse(NativeWorkflow.matches(site,"8765"))
    }
}
