package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class ChatPhotoUrlTest {
    private val thread="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    @Test fun onlyTheMatchingThreadAndTrustedHostAreAllowed() {
        val path="/storage/v1/object/sign/customer-chat/$thread/photo.jpg?token=example"
        assertTrue(ChatPhotoUrl.allowed(SUPABASE_URL+path,thread))
        assertFalse(ChatPhotoUrl.allowed("https://example.com"+path,thread))
        assertFalse(ChatPhotoUrl.allowed(SUPABASE_URL+path,"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"))
        assertFalse(ChatPhotoUrl.allowed(SUPABASE_URL+"/storage/v1/object/sign/customer-chat/$thread/%2e%2e/other.jpg",thread))
        assertFalse(ChatPhotoUrl.allowed(SUPABASE_URL.replace("https:","http:")+path,thread))
    }
    @Test fun teamPhotoMustMatchSiteAndTrustedStorage() {
        val other="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        val path="/storage/v1/object/sign/work-photos/sites/$other/$thread/team-chat/$other/$other-aaaaaaaaaaaaaaaaaaaaaaaa.jpg?token=x"
        assertTrue(ChatPhotoUrl.allowed(SUPABASE_URL+path,thread))
        assertFalse(ChatPhotoUrl.allowed(SUPABASE_URL+path,other))
        assertFalse(ChatPhotoUrl.allowed("https://example.com"+path,thread))
    }
}
