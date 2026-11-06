package kr.fieldassistant.prototype

import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class ChatPhotoPreviewTest {
    @Test fun imageDecodeIsBoundedAndRejectsInvalidDimensions() {
        assertEquals(1,ChatPhotoLoader.sampleSize(300,200,512))
        assertEquals(8,ChatPhotoLoader.sampleSize(4000,3000,512))
        assertEquals(4,ChatPhotoLoader.sampleSize(4000,3000,1600))
        assertNull(ChatPhotoLoader.sampleSize(0,100,512))
        assertNull(ChatPhotoLoader.sampleSize(16001,100,512))
        assertNull(ChatPhotoLoader.sampleSize(100,100,0))
    }
    @Test fun rotatingSignedLinksDoNotChangeTheDisplayedMessageVersion() {
        val one=JSONArray("""[{"id":"1","body":"사진","has_image":true,"image_url":"https://example.com/?token=old"}]""")
        val refreshed=JSONArray("""[{"id":"1","body":"사진","has_image":true,"image_url":"https://example.com/?token=new"}]""")
        val changed=JSONArray("""[{"id":"1","body":"다른 내용","has_image":true,"image_url":"https://example.com/?token=new"}]""")
        assertEquals(ChatPhotoMessages.version(one,false),ChatPhotoMessages.version(refreshed,false))
        assertNotEquals(ChatPhotoMessages.version(one,false),ChatPhotoMessages.version(changed,false))
        assertNotEquals(ChatPhotoMessages.version(one,false),ChatPhotoMessages.version(one,true))
        assertTrue(one.getJSONObject(0).has("image_url"))
    }
}
