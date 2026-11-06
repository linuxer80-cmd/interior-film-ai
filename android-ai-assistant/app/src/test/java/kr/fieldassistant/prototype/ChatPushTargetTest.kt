package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class ChatPushTargetTest {
    private val valid=mapOf("kind" to "team", "recipient_id" to "11111111-1111-1111-1111-111111111111",
        "company_id" to "22222222-2222-2222-2222-222222222222", "target_id" to "33333333-3333-3333-3333-333333333333",
        "message_id" to "44444444-4444-4444-4444-444444444444", "date" to "2026-11-06")
    @Test fun acceptsAuthorizedRoutingShape() {
        val target=ChatPushTarget.parse(valid)
        assertNotNull(target);assertEquals("team",target?.kind);assertEquals("2026-11-06",target?.date)
    }
    @Test fun rejectsMalformedAndUnknownRoutes() {
        assertNull(ChatPushTarget.parse(valid + ("target_id" to "bad")))
        assertNull(ChatPushTarget.parse(valid + ("kind" to "other")))
        assertNull(ChatPushTarget.parse(valid - "recipient_id"))
        assertNull(ChatPushTarget.parse(valid + ("date" to "invalid")))
    }
    @Test fun customerDoesNotRequireDate() {
        assertNotNull(ChatPushTarget.parse((valid + ("kind" to "customer")) - "date"))
    }
}
