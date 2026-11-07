package kr.fieldassistant.prototype

/** Routing metadata is opaque. Site data is fetched again under the current account. */
internal data class SiteNoticeTarget(val user:String,val company:String,val site:String,val notice:String,val action:String="detail") {
    companion object {
        private val uuid=Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        fun parse(data:Map<String,String>):SiteNoticeTarget? {
            if(data["kind"]!="notice") return null
            val user=data["recipient_id"] ?: return null
            val company=data["company_id"] ?: return null
            val site=data["site_id"] ?: return null
            val notice=data["notice_id"] ?: return null
            if(listOf(user,company,site,notice).any { !uuid.matches(it) }) return null
            return SiteNoticeTarget(user,company,site,notice,if(data["site_action"]=="report") "report" else "detail")
        }
        fun forAccount(target:SiteNoticeTarget?,user:String?,companyIds:Collection<String>):SiteNoticeTarget? =
            target?.takeIf { it.user==user && it.company in companyIds }
    }
}
