package kr.fieldassistant.prototype

import org.junit.Assert.*
import org.junit.Test

class SiteNoticeTargetTest {
    private val user="11111111-1111-1111-1111-111111111111"
    private val company="22222222-2222-2222-2222-222222222222"
    private val site="33333333-3333-3333-3333-333333333333"
    private val notice="44444444-4444-4444-4444-444444444444"
    private val data=mapOf("kind" to "notice","recipient_id" to user,"company_id" to company,"site_id" to site,"notice_id" to notice)
    @Test fun acceptsOnlyCompleteSiteNotices() {
        assertEquals(SiteNoticeTarget(user,company,site,notice),SiteNoticeTarget.parse(data))
        assertNull(SiteNoticeTarget.parse(data - "site_id"))
        assertNull(SiteNoticeTarget.parse(data + ("company_id" to "not-a-uuid")))
        assertNull(SiteNoticeTarget.parse(data + ("kind" to "team")))
    }
    @Test fun targetMustMatchCurrentAccountAndCompany() {
        val target=SiteNoticeTarget.parse(data)
        assertEquals(target,SiteNoticeTarget.forAccount(target,user,listOf(company)))
        assertNull(SiteNoticeTarget.forAccount(target,site,listOf(company)))
        assertNull(SiteNoticeTarget.forAccount(target,user,listOf(site)))
        assertNull(SiteNoticeTarget.forAccount(target,null,listOf(company)))
    }
}
