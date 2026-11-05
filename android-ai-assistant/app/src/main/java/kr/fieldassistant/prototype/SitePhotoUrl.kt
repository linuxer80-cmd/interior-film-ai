package kr.fieldassistant.prototype

import java.net.URI

/** A signed work-photos URL must remain on this project's HTTPS storage origin. */
internal object SitePhotoUrl {
    fun allowed(value:String,storageOrigin:String,companyId:String,siteId:String):Boolean {
        if(value.length !in 1..8192) return false
        if(!Regex("^[0-9a-fA-F-]{36}$").matches(companyId) || !Regex("^[0-9a-fA-F-]{36}$").matches(siteId)) return false
        return try {
            val url=URI(value).parseServerAuthority();val origin=URI(storageOrigin).parseServerAuthority()
            val path=url.path.orEmpty()
            url.scheme.equals("https",true) && url.host.equals(origin.host,true) && url.port in listOf(-1,443) &&
                url.rawUserInfo==null && url.rawFragment==null && path.startsWith("/storage/v1/object/sign/work-photos/sites/$companyId/$siteId/") &&
                path.split('/').none { it=="." || it==".." } && url.rawQuery?.split('&')?.any { it.startsWith("token=") && it.length>6 }==true
        } catch(_:Exception) { false }
    }
}
