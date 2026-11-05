package kr.fieldassistant.prototype
import org.junit.Assert.*
import org.junit.Test

class OAuthProofTest {
    @Test fun followsRfc7636Vector() {
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",OAuthProof.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }
    @Test fun rejectsWrongExpiredAndFutureState() {
        val state=OAuthProof.random()
        assertEquals(43,state.length)
        assertTrue(OAuthProof.validState(state,state,1000,2000))
        assertFalse(OAuthProof.validState(state,OAuthProof.random(),1000,2000))
        assertFalse(OAuthProof.validState(state,state,1000,601001))
        assertFalse(OAuthProof.validState(state,state,1000,999))
        assertFalse(OAuthProof.validState("","",1000,2000))
    }
    @Test fun passwordMaskTracksEditsWithoutRevealingLastCharacter() {
        val input=StringBuilder("abc123")
        val masked=AlwaysMaskedPassword().getTransformation(input,null)
        assertEquals("••••••",masked.toString())
        input.append('X')
        assertEquals('•',masked[6]);assertEquals(7,masked.length)
        input.clear();assertEquals("",masked.toString())
    }
}
