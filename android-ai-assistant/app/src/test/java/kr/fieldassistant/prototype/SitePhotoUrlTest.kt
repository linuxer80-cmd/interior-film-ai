package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class SitePhotoUrlTest {
    private val origin="https://project.supabase.co"
    private val company="11111111-1111-4111-8111-111111111111"
    private val site="22222222-2222-4222-8222-222222222222"
    @Test fun onlyAllowsSignedWorkPhotosFromTheExpectedOrigin() {
        val path="/storage/v1/object/sign/work-photos/sites/$company/$site/after/a.jpg"
        assertTrue(SitePhotoUrl.allowed("https://project.supabase.co$path?token=abc",origin,company,site))
        for(url in listOf("http://project.supabase.co$path?token=x",
            "https://evil.example$path?token=x",
            "https://project.supabase.co/storage/v1/object/public/work-photos/sites/$company/$site/a?token=x",
            "https://project.supabase.co/storage/v1/object/sign/work-photos/sites/$company/$site/%2e%2e/other?token=x",
            "https://project.supabase.co/storage/v1/object/sign/work-photos/sites/$company/33333333-3333-4333-8333-333333333333/a?token=x",
            "https://project.supabase.co$path")) assertFalse(url,SitePhotoUrl.allowed(url,origin,company,site))
    }
}
