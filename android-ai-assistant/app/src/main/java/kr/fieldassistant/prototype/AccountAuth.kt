package kr.fieldassistant.prototype

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.annotations.SupabaseInternal
import io.ktor.client.engine.android.Android
import io.ktor.client.engine.okhttp.OkHttp
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.broadcastFlow
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** Session secrets are encrypted by a non-exportable Android Keystore key. */
internal class SecureSessionManager(context: Context) : SessionManager {
    private val app=context.applicationContext
    private val prefs=app.getSharedPreferences("secure_auth_session", Context.MODE_PRIVATE)
    private val json=Json { encodeDefaults=true; ignoreUnknownKeys=true }
    private fun key(): SecretKey {
        val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("field_assistant_session_v1", null) as? SecretKey)?.let { return it }
        val generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder("field_assistant_session_v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        return generator.generateKey()
    }
    fun storePending(value:String) {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE,key())
        check(prefs.edit().putString("oauth_pending",Base64.encodeToString(cipher.iv+cipher.doFinal(value.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)).commit())
    }
    fun pending():String? { return try {
        val bytes=Base64.decode(prefs.getString("oauth_pending",null) ?: return null,Base64.NO_WRAP)
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
        cipher.doFinal(bytes.copyOfRange(12,bytes.size)).toString(Charsets.UTF_8)
    } catch(_:Exception) { null } }
    fun clearPending() { prefs.edit().remove("oauth_pending").commit() }
    override suspend fun saveSession(session: UserSession) {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE,key())
        val encrypted=cipher.doFinal(json.encodeToString(session).toByteArray(Charsets.UTF_8))
        val value=Base64.encodeToString(cipher.iv+encrypted,Base64.NO_WRAP)
        check(prefs.edit().putString("session",value).commit()) { "Session storage failed" }
    }
    override suspend fun loadSession(): UserSession? {
        val value=prefs.getString("session",null) ?: return null
        return try {
            val encrypted=Base64.decode(value,Base64.NO_WRAP)
            require(encrypted.size>28)
            val cipher=Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,encrypted.copyOfRange(0,12)))
            json.decodeFromString<UserSession>(cipher.doFinal(encrypted.copyOfRange(12,encrypted.size)).toString(Charsets.UTF_8))
        } catch (_: Exception) { prefs.edit().remove("session").commit(); null }
    }
    override suspend fun deleteSession() { prefs.edit().remove("session").commit() }
}

internal class ExpenseRejected(message:String):Exception(message)
internal class FilmRejected(message:String):Exception(message)
internal class ScreenshotRetryNew:Exception()
internal class TradeApiFailure(val status:Int,message:String):Exception(message)

internal data class CompanyAccess(val id: String, val name: String, val role: String)
internal data class VerifiedAccount(val userId: String, val companies: List<CompanyAccess>)

internal class AccountAuth private constructor(context: Context) {
    private val appContext=context.applicationContext
    private val chatWatchMutex=Mutex()
    private val chatHttp=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(15,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).build()
    companion object {
        @Volatile private var instance: AccountAuth?=null
        fun shared(context: Context): AccountAuth = instance ?: synchronized(this) {
            instance ?: AccountAuth(context.applicationContext).also { instance=it }
        }
    }
    // Pinned supabase-kt 3.5.0 exposes client-wide redirect policy via this opt-in.
    @OptIn(SupabaseInternal::class)
    private val client=createSupabaseClient(SecureTransport.requireHttps(SUPABASE_URL),SUPABASE_PUBLIC_KEY) {
        useHTTPS=true
        httpEngine=OkHttp.create()
        httpConfig { requireEncryptedTransport() }
        install(Auth) { sessionManager=SecureSessionManager(context); autoLoadFromStorage=true; autoSaveToStorage=true }
        install(Postgrest) { requireValidSession=true }
        install(Realtime) { secure=true }
    }
    suspend fun publicSamples():List<SampleSearch.Product> = withContext(Dispatchers.IO) {
        val conn=SecureTransport.open("https://interior-film-ai.vercel.app/api/film-products")
        try {
            conn.instanceFollowRedirects=false;conn.connectTimeout=15000;conn.readTimeout=30000
            check(conn.responseCode==200)
            val bytes=conn.inputStream.use { input ->
                val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);var n:Int
                while(input.read(buffer).also { n=it }!=-1) { check(out.size()+n<=12*1024*1024);out.write(buffer,0,n) }
                out.toByteArray()
            }
            val body=JSONObject(bytes.toString(Charsets.UTF_8));check(body.optBoolean("success"))
            val rows=body.getJSONArray("products")
            (0 until rows.length()).mapNotNull { i ->
                val p=rows.optJSONObject(i) ?: return@mapNotNull null
                val aliases=p.optJSONArray("aliases") ?: JSONArray()
                fun field(key:String)=if(p.isNull(key)) "" else p.optString(key)
                SampleSearch.Product(field("id"),field("brand"),field("product_code"),field("product_name"),field("category_key"),field("pattern_line"),field("sample_image_path"),(0 until aliases.length()).mapNotNull { j -> if(aliases.isNull(j)) null else aliases.optString(j).takeIf { it.isNotBlank() } },field("texture"))
            }
        } finally { conn.disconnect() }
    }
    suspend fun restore(): VerifiedAccount? {
        client.auth.awaitInitialization()
        if(client.auth.currentSessionOrNull()==null) return null
        return verify()
    }
    suspend fun signIn(email: String, password: String): VerifiedAccount {
        client.auth.signInWith(Email) { this.email=email.trim().lowercase(Locale.ROOT); this.password=password }
        return try { verify() } catch (error: Exception) {
            client.auth.clearSession()
            throw error
        }
    }
    suspend fun importKakaoSession(raw:String): VerifiedAccount {
        client.auth.awaitInitialization()
        val body=JSONObject(raw)
        val session=UserSession(accessToken=body.getString("access_token"),refreshToken=body.getString("refresh_token"),
            expiresIn=body.getLong("expires_in"),tokenType=body.getString("token_type"),user=null)
        require(session.accessToken.isNotBlank() && session.refreshToken.isNotBlank())
        client.auth.importSession(session)
        return try { verify().also { require(it.companies.isNotEmpty()) } }
        catch(e:Exception) { client.auth.clearSession();throw e }
    }
    suspend fun signOut() { client.auth.signOut() }
    suspend fun clearSession() { client.auth.clearSession() }

    suspend fun updateChatPush(expectedUser:String,deviceId:String,token:String?=null,chatReady:Boolean=false,generalReady:Boolean=false) {
        check(verify().userId==expectedUser) { "계정이 변경되었습니다." }
        val bearer=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        val body=JSONObject().put("deviceId",deviceId).apply { if(token!=null) { put("token",token);put("chatReady",chatReady);put("generalReady",generalReady) } }
        withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/assistant/chat-push")
            try {
                c.requestMethod=if(token==null) "DELETE" else "POST";c.doOutput=true
                c.setRequestProperty("Authorization","Bearer $bearer");c.setRequestProperty("Content-Type","application/json")
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                check(c.responseCode in 200..299) { "알림 등록을 확인하지 못했습니다." }
            } finally { c.disconnect() }
        }
    }

    /** Only subscribe to private invalidations; message content is re-fetched through authorized APIs. */
    suspend fun watchChat(expectedUser:String, company:CompanyAccess, kind:String, target:String, date:String, onChange:()->Unit, onState:(Boolean)->Unit):Unit = chatWatchMutex.withLock { coroutineScope {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==company.id && it.role==company.role }) { "계정 또는 업체가 변경되었습니다." }
        require(kind in listOf("customer","team") && target.matches(Regex("^[0-9a-fA-F-]{36}$")))
        val topic=if(kind=="customer") {
            check(company.role=="관리자");"customer-chat-admin:${company.id}"
        } else {
            require(date.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$")));"team-chat:$target:$date"
        }
        val channel=client.realtime.channel(topic) { isPrivate=true }
        val events=launch(start=CoroutineStart.UNDISPATCHED) { channel.broadcastFlow<JsonObject>(event="changed").collect { onChange() } }
        val statuses=launch(start=CoroutineStart.UNDISPATCHED) {
            var joined=false
            channel.status.collect { state ->
                val connected=state==RealtimeChannel.Status.SUBSCRIBED
                onState(connected)
                if(connected) { joined=true;onChange() } // Recover changes missed during a disconnect.
                if(joined && state==RealtimeChannel.Status.UNSUBSCRIBED) error("실시간 연결을 다시 시작합니다.")
            }
        }
        try {
            val joined=withTimeoutOrNull(15000) { channel.subscribe(blockUntilSubscribed=true);true } ?: false
            check(joined) { "실시간 연결을 다시 시도합니다." }
            awaitCancellation()
        }
        finally {
            events.cancel();statuses.cancel()
            withContext(NonCancellable) { withTimeoutOrNull(5000) { client.realtime.removeChannel(channel) } }
        }
    } }

    suspend fun sendCustomerPhoto(expectedUser:String,company:CompanyAccess,target:String,id:String,text:String,bytes:ByteArray,mime:String,kind:String="customer",date:String=""):JSONObject {
        require(kind in listOf("customer","team"))
        if(kind=="team") require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(date))
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==company.id && it.role==company.role && (kind=="team" || it.role=="관리자") }) { "계정 또는 업체가 변경되었습니다." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(target) && Regex("^[0-9a-fA-F-]{36}$").matches(id))
        require(bytes.isNotEmpty() && bytes.size<=2*1024*1024 && mime in listOf("image/jpeg","image/png","image/webp"))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val form=okhttp3.MultipartBody.Builder().setType(okhttp3.MultipartBody.FORM)
                .addFormDataPart("messageId",id).addFormDataPart("text",text)
                .addFormDataPart("photo","photo",bytes.toRequestBody(mime.toMediaType())).build()
            val path=if(kind=="team") "/api/worker/team?siteId="+Uri.encode(target)+"&date="+Uri.encode(date) else "/api/admin/customer-chat?thread="+Uri.encode(target)
            val request=Request.Builder().url("https://interior-film-ai.vercel.app"+path)
                .header("Authorization","Bearer "+token).post(form).build()
            chatHttp.newCall(request).execute().use { response ->
                val raw=response.body?.byteStream()?.use { SecureTransport.readBounded(it,1024*1024) } ?: ByteArray(0)
                val result=try { JSONObject(raw.toString(Charsets.UTF_8)) } catch(_:Exception) { JSONObject() }
                check(response.isSuccessful) { result.optString("error").ifBlank { "사진 전송 결과를 확인하지 못했습니다. 다시 시도해 주세요." } }
                result
            }
        }
    }

    /** Existing chat endpoints perform their own server-side authorization. */
    suspend fun nativeChat(expectedUser:String, company:CompanyAccess, kind:String, target:String="", date:String="", method:String="GET", body:JSONObject?=null, offset:Int=0, before:String=""):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==company.id && it.role==company.role }) { "계정 또는 업체가 변경되었습니다." }
        require(kind in listOf("customers","customer","team","team_summary") && method in listOf("GET","POST","PATCH"))
        if(kind=="team_summary") require(method=="GET")
        if(method=="PATCH") require(kind=="team")
        require(offset in 0..100000)
        if(kind !in listOf("team","team_summary")) check(company.role=="관리자") { "고객 채팅은 관리자만 이용할 수 있습니다." }
        if(kind!="customers") require(Regex("^[0-9a-fA-F-]{36}$").matches(target))
        if(kind in listOf("team","team_summary")) require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(date))
        val path=when(kind) {
            "customers" -> "/api/admin/customer-chat?offset=$offset"
            "customer" -> "/api/admin/customer-chat?thread="+Uri.encode(target)+(if(before.isNotBlank()) "&before="+Uri.encode(before) else "")
            else -> "/api/worker/team?siteId="+Uri.encode(target)+"&date="+Uri.encode(date)+(if(kind=="team_summary") "&view=summary" else "")
        }
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        if(method=="PATCH") return withContext(Dispatchers.IO) {
            val url=SecureTransport.requireHttps("https://interior-film-ai.vercel.app"+path)
            val request=Request.Builder().url(url).header("Authorization","Bearer "+token).header("Cache-Control","no-store")
                .patch(requireNotNull(body).toString().toRequestBody("application/json".toMediaType())).build()
            chatHttp.newCall(request).execute().use { response ->
                val bytes=response.body?.byteStream()?.use { SecureTransport.readBounded(it,2*1024*1024) } ?: ByteArray(0)
                val result=try { JSONObject(bytes.toString(Charsets.UTF_8)) } catch(_:Exception) { JSONObject() }
                check(response.isSuccessful) { result.optString("error").ifBlank { "읽음 상태를 확인하지 못했습니다." } }
                result
            }
        }
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app"+path)
            try {
                c.requestMethod=method;c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(method!="GET") {
                    c.doOutput=true;c.setRequestProperty("Content-Type","application/json")
                    c.setRequestProperty("Origin","https://interior-film-ai.vercel.app")
                    c.outputStream.use { it.write(requireNotNull(body).toString().toByteArray(Charsets.UTF_8)) }
                }
                val status=c.responseCode
                val bytes=(if(status in 200..299)c.inputStream else c.errorStream)?.use { SecureTransport.readBounded(it,2*1024*1024) } ?: ByteArray(0)
                val result=try { JSONObject(bytes.toString(Charsets.UTF_8)) } catch(_:Exception) { JSONObject() }
                check(status in 200..299) { result.optString("error").ifBlank { "채팅을 처리하지 못했습니다. 다시 확인해 주세요." } }
                if(kind !in listOf("team","team_summary") && method=="GET") check(result.optString("companyId")==company.id) { "선택한 업체의 채팅이 아닙니다." }
                result
            } finally { c.disconnect() }
        }
    }

    suspend fun saveConsultation(companyId: String, request: JSONObject): JSONObject {
        // The RPC authorizes from the current verified account, not the supplied company ID.
        val user=client.auth.retrieveUserForCurrentSession()
        val owners=JSONArray(client.postgrest.rpc("get_my_company").data)
        val allowed=(0 until owners.length()).any {
            val row=owners.getJSONObject(it)
            row.optString("company_id")==companyId && row.optString("role")=="owner" && row.optBoolean("is_active",false)
        }
        check(user.id.isNotBlank() && allowed) { "선택한 업체의 활성 관리자만 상담 현장을 등록할 수 있습니다." }
        val args=Json.parseToJsonElement(request.toString()).jsonObject
        return JSONObject(client.postgrest.rpc("save_consultation_site",args).data)
    }

    private suspend fun verify(): VerifiedAccount {
        // Never trust role or company supplied by the client: both are re-read server-side.
        val user=client.auth.retrieveUserForCurrentSession()
        val id=user.id
        require(Regex("^[0-9a-fA-F-]{36}$").matches(id))
        val owners=JSONArray(client.postgrest.rpc("get_my_company").data)
        val companies=linkedMapOf<String,CompanyAccess>()
        for(i in 0 until owners.length()) {
            val row=owners.getJSONObject(i)
            val companyId=row.optString("company_id","")
            if(row.optString("role")=="owner" && row.optBoolean("is_active",true) && companyId.isNotBlank())
                companies[companyId]=CompanyAccess(companyId,row.optString("company_name","업체명 미등록"),"관리자")
        }
        val token=client.auth.currentAccessTokenOrNull() ?: error("인증 세션이 만료됐습니다.")
        val workers=withContext(Dispatchers.IO) { workerCompanies(token) }
        for(i in 0 until workers.length()) {
            val row=workers.getJSONObject(i);val companyId=row.optString("company_id","")
            if(companyId.isNotBlank() && !companies.containsKey(companyId))
                companies[companyId]=CompanyAccess(companyId,row.optString("company_name","업체명 미등록"),"시공자")
        }
        return VerifiedAccount(id,companies.values.toList())
    }
    suspend fun assignedSites(expectedUser: String): JSONArray {
        client.auth.awaitInitialization()
        val user=client.auth.retrieveUserForCurrentSession()
        check(user.id==expectedUser) { "다른 계정입니다." }
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/worker/my-sites")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(c.responseCode!=200) throw IllegalStateException("시공 일정을 확인하지 못했습니다.")
                JSONObject(c.inputStream.bufferedReader().use { it.readText() }).getJSONArray("sites")
            } finally { c.disconnect() }
        }
    }
    suspend fun saveChatExpense(expectedUser:String,companyId:String,body:JSONObject):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체가 변경되었습니다." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(body.optString("siteId")))
        require(Regex("^[0-9a-fA-F-]{36}$").matches(body.optString("id")))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/site-expenses")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=30000;c.doOutput=true
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json")
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val response=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(code in 400..499 && code!=408) throw ExpenseRejected(response.optString("error").ifBlank { "경비 저장 권한 또는 내용을 확인해 주세요." })
                if(code !in 200..299 || !response.optBoolean("success")) throw IllegalStateException("경비 저장 결과를 확인하지 못했습니다.")
                response
            } finally { c.disconnect() }
        }
    }
    suspend fun filmStock(expectedUser:String,companyId:String,siteId:String,body:JSONObject?=null):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체가 변경되었습니다." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        if(body!=null) require(body.optString("siteId")==siteId && body.optString("action")=="return")
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/film-stock"+(if(body==null) "?siteId=$siteId" else ""))
            try {
                c.instanceFollowRedirects=false;c.requestMethod=if(body==null) "GET" else "POST";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(body!=null) { c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(code in 400..499 && code!=408) throw FilmRejected(result.optString("error").ifBlank { "재고와 권한을 확인해 주세요." })
                check(code in 200..299 && result.optJSONArray("trips")!=null) { "재고 처리 결과를 확인하지 못했습니다." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun searchSitePhotos(expectedUser:String,companyId:String,workerView:Boolean,query:PhotoSearch.Query):JSONObject {
        val verified=verify()
        val role=if(workerView) "시공자" else "관리자"
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role==role }) { "계정과 현장 권한을 확인해 주세요." }
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        val args=listOf("site" to query.site,"part" to query.part,"code" to query.code,"from" to query.from,"to" to query.to,"type" to query.type)
            .filter { it.second.isNotBlank() }.joinToString("&") { it.first+"="+Uri.encode(it.second) }
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/assistant/photo-search?"+args)
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Assistant-Company",companyId)
                c.setRequestProperty("X-Assistant-View",if(workerView) "worker" else "owner");c.setRequestProperty("Cache-Control","no-store")
                val status=c.responseCode
                val raw=(if(status in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(status in 200..299) { result.optString("error").ifBlank { "사진 검색을 완료하지 못했습니다." } }
                check(result.optString("companyId")==companyId && result.opt("truncated") is Boolean && (result.optJSONArray("rows")?.length() ?: 31)<=30) { "사진 검색 결과를 확인하지 못했습니다." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantSitePhotos(expectedUser:String,companyId:String,siteId:String,workerView:Boolean,type:String,page:Int):JSONObject {
        val verified=verify()
        val role=if(workerView) "시공자" else "관리자"
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role==role }) { "계정과 현장 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId) && type in listOf("all","request","before","after") && page in 0..999)
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/assistant/site-photos?siteId=$siteId&type=$type&page=$page")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Assistant-Company",companyId)
                c.setRequestProperty("X-Assistant-View",if(workerView) "worker" else "owner");c.setRequestProperty("Cache-Control","no-store")
                val code=c.responseCode
                val raw=(if(code in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299) { if(code==404 || code==405) "현장 사진 보기 기능이 서버에 아직 적용되지 않았습니다." else result.optString("error").ifBlank { "사진을 불러오지 못했습니다." } }
                check(result.optString("siteId")==siteId && result.optString("companyId")==companyId && result.optString("type")==type && result.optInt("page",-1)==page && result.opt("hasMore") is Boolean) { "현장 사진 응답을 확인하지 못했습니다." }
                val photos=result.optJSONArray("photos") ?: error("현장 사진 목록을 확인하지 못했습니다.")
                check(photos.length()<=12)
                for(i in 0 until photos.length()) {
                    val item=photos.optJSONObject(i) ?: error("사진 정보를 확인하지 못했습니다.")
                    check(Regex("^[0-9a-fA-F-]{36}$").matches(item.optString("id")) && item.optString("type") in listOf("request","before","after")) { "사진 정보를 확인하지 못했습니다." }
                    if(!item.isNull("url")) check(SitePhotoUrl.allowed(item.optString("url"),SUPABASE_URL,companyId,siteId)) { "사진 주소를 확인하지 못했습니다." }
                }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun dealerInventory(expectedUser:String,companyId:String,body:JSONObject?=null):JSONObject {
        val user=client.auth.retrieveUserForCurrentSession()
        val owners=JSONArray(client.postgrest.rpc("get_my_company").data)
        check(user.id==expectedUser && (0 until owners.length()).any { i -> owners.optJSONObject(i)?.let { it.optString("company_id")==companyId && it.optString("role")=="owner" && it.optBoolean("is_active") }==true }) { "선택한 업체의 활성 관리자만 재고를 관리할 수 있습니다." }
        if(body!=null) {
            require(body.optString("action")=="receive" && Regex("^[0-9a-fA-F-]{36}$").matches(body.optString("requestId")))
        }
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/film-dealers")
            try {
                c.instanceFollowRedirects=false;c.requestMethod=if(body==null) "GET" else "POST";c.connectTimeout=15000;c.readTimeout=90000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(body!=null) { c.doOutput=true;c.setRequestProperty("Content-Type","application/json; charset=utf-8");c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val data=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(code in 400..499 && code!=408) throw FilmRejected(data.optString("error").ifBlank { "입고 내용이나 권한을 확인해 주세요." })
                check(code in 200..299 && data.optJSONArray("dealers")!=null && data.optJSONArray("prices")!=null && data.optJSONArray("purchases")!=null && data.optJSONObject("stock")?.optBoolean("owner")==true && data.optJSONObject("stock")?.optJSONArray("rolls")!=null) { "입고 또는 재고 조회 결과를 확인하지 못했습니다." }
                for(key in listOf("dealers","prices","purchases")) { val rows=data.getJSONArray(key);for(i in 0 until rows.length()) { val row=rows.optJSONObject(i) ?: error("업체 재고 정보를 확인하지 못했습니다.");check(row.optString("company_id")==companyId) { "업체 재고 정보를 확인하지 못했습니다." } } }
                data
            } finally { c.disconnect() }
        }
    }
    suspend fun analyzeSiteScreenshot(expectedUser:String,companyId:String,images:List<ByteArray>,requestId:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(ScreenshotBatch.withinLimits(images) && Regex("^[0-9a-fA-F-]{36}$").matches(requestId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val boundary="Assistant"+java.util.UUID.randomUUID().toString().replace("-","")
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/site-screenshot")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=75000;c.doOutput=true
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","multipart/form-data; boundary=$boundary")
                c.outputStream.use { out ->
                    fun line(s:String) { out.write((s+"\r\n").toByteArray(Charsets.UTF_8)) }
                    line("--$boundary");line("Content-Disposition: form-data; name=\"requestId\"");line("");line(requestId)
                    line("--$boundary");line("Content-Disposition: form-data; name=\"referenceDate\"");line("");line("")
                    images.forEachIndexed { index,image ->
                        line("--$boundary");line("Content-Disposition: form-data; name=\"images\"; filename=\"screenshot-${index+1}.jpg\"");line("Content-Type: image/jpeg");line("")
                        out.write(image);line("")
                    }
                    line("--$boundary--")
                }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(code==409 && result.optString("code")=="RETRY_NEW") throw ScreenshotRetryNew()
                check(code in 200..299) { result.optString("error").ifBlank { "사진 분석 결과를 확인하지 못했습니다. 같은 사진을 다시 선택해 주세요." } }
                result.optJSONObject("data") ?: error("사진 분석 결과를 확인하지 못했습니다.")
            } finally { c.disconnect() }
        }
    }
    suspend fun analyzeSiteText(expectedUser:String,companyId:String,content:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(content.length in 5..20000)
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/parse-site-call")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=75000;c.doOutput=true
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json")
                c.outputStream.use { it.write(JSONObject().put("content",content).toString().toByteArray(Charsets.UTF_8)) }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299 && result.optBoolean("success")) { "상담 내용을 분석하지 못했습니다. 로그인과 연결 상태를 확인해 주세요." }
                result.optJSONObject("data") ?: error("분석 결과를 확인하지 못했습니다.")
            } finally { c.disconnect() }
        }
    }
    /** Uploads only an explicitly selected recording, then removes its temporary object. */
    suspend fun transcribeSiteRecording(expectedUser:String,companyId:String,uri:Uri):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(uri.scheme=="content")
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val resolver=appContext.contentResolver
            val name=resolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { c ->
                if(c.moveToFirst()) c.getString(0) else null
            }.orEmpty().take(255)
            val ext=name.substringAfterLast('.',"").lowercase(Locale.ROOT)
            require(ext in setOf("m4a","mp3","mp4","wav","webm","mpeg","mpga")) { "지원하는 녹음 형식은 m4a, mp3, mp4, wav, webm, mpeg, mpga입니다." }
            val bytes=resolver.openInputStream(uri)?.use { input ->
                val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);var n:Int
                while(input.read(buffer).also { n=it }!=-1) {
                    require(out.size()+n<=25*1024*1024) { "녹음 파일은 25MB 이하여야 합니다." }
                    out.write(buffer,0,n)
                }
                out.toByteArray()
            } ?: error("녹음 파일을 읽지 못했습니다. 다시 선택해 주세요.")
            require(bytes.isNotEmpty()) { "녹음 파일이 비어 있습니다." }
            fun api(method:String,path:String,body:JSONObject):JSONObject {
                val c=SecureTransport.open("https://interior-film-ai.vercel.app"+path)
                try {
                    c.instanceFollowRedirects=false;c.requestMethod=method;c.connectTimeout=15000;c.readTimeout=120000;c.doOutput=true
                    c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json")
                    c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                    val code=c.responseCode
                    val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                    val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                    check(code in 200..299) { result.optString("error").ifBlank { "녹음 분석 요청에 실패했습니다. ($code)" } }
                    return result
                } finally { c.disconnect() }
            }
            val prepared=api("POST","/api/admin/site-call-upload",JSONObject().put("fileName",name).put("size",bytes.size))
            val bucket=prepared.optString("bucket");val path=prepared.optString("path");val signed=prepared.optString("token")
            val expectedPrefix="$companyId/$expectedUser/"
            check(bucket=="site-call-audio-private" && path.startsWith(expectedPrefix) &&
                Regex("^[0-9a-fA-F-]{36}\\.(m4a|mp3|mp4|wav|webm|mpeg|mpga)$").matches(path.removePrefix(expectedPrefix)) &&
                path.substringAfterLast('.')==ext && signed.isNotBlank()) { "녹음 업로드 권한을 확인하지 못했습니다." }
            try {
                val uploadUrl=SUPABASE_URL.trimEnd('/')+"/storage/v1/object/upload/sign/"+bucket+"/"+
                    path.split('/').joinToString("/") { Uri.encode(it) }+"?token="+Uri.encode(signed)
                val c=SecureTransport.open(uploadUrl)
                try {
                    c.instanceFollowRedirects=false;c.requestMethod="PUT";c.connectTimeout=15000;c.readTimeout=120000;c.doOutput=true
                    c.setRequestProperty("apikey",SUPABASE_PUBLIC_KEY);c.setRequestProperty("Content-Type","application/octet-stream")
                    c.setRequestProperty("x-upsert","false");c.setFixedLengthStreamingMode(bytes.size)
                    c.outputStream.use { it.write(bytes) }
                    check(c.responseCode in 200..299) { "녹음 업로드에 실패했습니다. 연결 상태를 확인해 주세요." }
                } finally { c.disconnect() }
                val result=api("POST","/api/admin/transcribe-site-call",JSONObject().put("path",path).put("fileName",name))
                check(result.optBoolean("success")) { "녹음을 글자로 변환하지 못했습니다." }
                result.optJSONObject("data") ?: error("음성 변환 결과를 확인하지 못했습니다.")
            } finally {
                try { api("DELETE","/api/admin/site-call-upload",JSONObject().put("path",path)) } catch(_:Exception) { /* server also removes temporary audio */ }
            }
        }
    }
    suspend fun laborMarket(expectedUser:String,companyId:String,workerView:Boolean,page:Int):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체가 변경되었습니다." }
        if(!workerView) check(verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(page in 0..1000)
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/labor-market?page=$page")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Labor-View",if(workerView) "worker" else "manager");c.setRequestProperty("Cache-Control","no-store")
                val status=c.responseCode
                val raw=(if(status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(status !in 200..299) error(result.optString("error").ifBlank { "구인·구직 정보를 불러오지 못했습니다." })
                check(result.has("manager") && result.optBoolean("manager")!=workerView) { "구인·구직 이용 권한을 확인해 주세요." }
                if(!workerView) check(result.optString("companyId")==companyId) { "선택한 업체의 관리자 계정을 확인해 주세요." }
                for(key in listOf("jobs","applications","candidates")) { val rows=result.optJSONArray(key) ?: error("구인·구직 정보를 확인하지 못했습니다.");for(i in 0 until rows.length()) check(rows.optJSONObject(i)!=null) { "구인·구직 정보를 확인하지 못했습니다." } }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun applyLaborJob(expectedUser:String,companyId:String,jobId:String) {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체가 변경되었습니다." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(jobId)) { "공고를 다시 확인해 주세요." }
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/labor-market")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=30000;c.doOutput=true
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Labor-View","worker");c.setRequestProperty("Content-Type","application/json")
                val body=JSONObject().put("action","apply").put("jobId",jobId).put("share_phone",true)
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val status=c.responseCode
                val raw=(if(status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(status in 400..499 && status !in listOf(408,429)) throw TradeApiFailure(status,result.optString("error").ifBlank { "지원하지 못했습니다. 공고와 프로필을 확인해 주세요." })
                check(status in 200..299) { "지원 결과를 확인하지 못했습니다." }
            } finally { c.disconnect() }
        }
    }
    suspend fun replyLaborProposal(expectedUser:String,companyId:String,jobId:String,apply:Boolean,wage:Long) {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체가 변경되었습니다." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(jobId)) { "현장 제안을 다시 확인해 주세요." }
        if(apply) require(wage in 1..9007199254740991L) { "제안 일당을 확인해 주세요." }
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/labor-market")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=30000;c.doOutput=true
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Labor-View","worker");c.setRequestProperty("Content-Type","application/json")
                val body=JSONObject().put("action",if(apply) "proposal_apply" else "proposal_decline").put("jobId",jobId)
                if(apply) body.put("share_phone",true).put("expectedWage",wage)
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val status=c.responseCode
                val raw=(if(status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(status in 400..499 && status !in listOf(408,429)) throw TradeApiFailure(status,result.optString("error").ifBlank { "현장 제안을 처리하지 못했습니다." })
                check(status in 200..299 && result.optBoolean("ok",false)) { "처리 결과를 확인하지 못했습니다." }
            } finally { c.disconnect() }
        }
    }
    suspend fun tradeClients(expectedUser:String,companyId:String,body:JSONObject?=null):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        if(body!=null) {
            require(body.optString("action") in listOf("client","contact"))
            require(Regex("^[0-9a-fA-F-]{36}$").matches(body.optString("requestId")))
        }
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/trade-clients")
            try {
                c.instanceFollowRedirects=false;c.requestMethod=if(body==null) "GET" else "POST";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(body!=null) { c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
                val status=c.responseCode
                val raw=(if(status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(status !in 200..299) throw TradeApiFailure(status,result.optString("error").ifBlank { "거래처 요청을 처리하지 못했습니다." })
                if(body==null) {
                    for(key in listOf("clients","contacts")) {
                        val rows=result.optJSONArray(key) ?: error("거래처 목록을 확인하지 못했습니다.")
                        for(i in 0 until rows.length()) { val row=rows.getJSONObject(i);check(row.optString("company_id")==companyId) { "다른 업체의 정보입니다." } }
                    }
                }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun customerEstimateSlug(expectedUser:String,companyId:String):String? {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(companyId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open(SUPABASE_URL+"/rest/v1/companies?select=id,slug&id=eq."+companyId+"&limit=1")
            try {
                c.instanceFollowRedirects=false;c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("apikey",SUPABASE_PUBLIC_KEY);c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                check(c.responseCode in 200..299) { "고객페이지 주소를 확인하지 못했습니다." }
                val row=JSONArray(c.inputStream.bufferedReader().use { it.readText() }).optJSONObject(0) ?: return@withContext null
                check(row.optString("id")==companyId)
                row.optString("slug").takeUnless { it.isBlank() || it=="null" }
            } finally { c.disconnect() }
        }
    }
    suspend fun customerProfile(expectedUser:String,companyId:String,changes:JSONObject?=null,version:String?=null):JSONObject? {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(companyId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        val allowed=listOf("business_name","representative_name","business_number","business_address","public_phone","public_email","regions","introduction","blog_url","instagram_url","place_url")
        if(changes!=null) {
            require(changes.keys().asSequence().all { it in allowed })
            require(version!=null)
        }
        return withContext(Dispatchers.IO) {
            val fields=(listOf("company_id","updated_at","is_published","services")+allowed).joinToString(",")
            val versionFilter=if(changes==null) "" else if(version!!.isEmpty()) "&updated_at=is.null" else "&updated_at=eq."+java.net.URLEncoder.encode(version,"UTF-8")
            val c=SecureTransport.open(SUPABASE_URL+"/rest/v1/company_public_profiles?select="+fields+"&company_id=eq."+companyId+versionFilter+(if(changes==null) "&limit=1" else ""))
            try {
                c.instanceFollowRedirects=false;c.requestMethod=if(changes==null) "GET" else "PATCH";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("apikey",SUPABASE_PUBLIC_KEY);c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(changes!=null) { c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Prefer","return=representation");c.outputStream.use { it.write(JSONObject(changes.toString()).put("updated_at",java.time.Instant.now().toString()).toString().toByteArray(Charsets.UTF_8)) } }
                check(c.responseCode in 200..299) { "고객페이지 정보를 처리하지 못했습니다. 권한과 연결을 확인해 주세요." }
                val rows=JSONArray(c.inputStream.bufferedReader().use { it.readText() })
                if(changes!=null && rows.length()==0) error("다른 곳에서 정보가 변경됐습니다. 다시 확인한 뒤 수정해 주세요.")
                rows.optJSONObject(0)?.also { check(it.optString("company_id")==companyId) }
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantProfit(expectedUser:String, companyId:String, from:String, to:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(from) && Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(to))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/assistant-profit?from=$from&to=$to")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Assistant-Company",companyId);c.setRequestProperty("Cache-Control","no-store")
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299) { if(code==409) "필름장이 매출·수익 화면에서 제외 설정을 먼저 확인해 주세요." else "매출·수익을 조회하지 못했습니다. 권한과 연결 상태를 확인해 주세요." }
                check(result.optString("from")==from && result.optString("to")==to) { "조회 기간을 확인하지 못했습니다." }
                for(key in listOf("revenue","labor","material","expense","profit","confirmedCount","pendingCount")) check(result.has(key) && !result.isNull(key) && result.opt(key) is Number) { "조회 결과를 확인하지 못했습니다." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantReceivableSummary(expectedUser:String,companyId:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(companyId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/assistant-receivables")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Assistant-Company",companyId);c.setRequestProperty("Cache-Control","no-store")
                check(c.responseCode in 200..299) { "미수금을 확인하지 못했습니다." }
                val result=JSONObject(c.inputStream.bufferedReader().use { it.readText() })
                val outstanding=result.opt("outstanding") as? Number ?: error("미수금을 확인하지 못했습니다.")
                val unconfirmed=result.opt("unconfirmed") as? Number ?: error("미수금을 확인하지 못했습니다.")
                val unknown=result.opt("unknownContract") as? Number ?: error("계약금액 미확정 현장 수를 확인하지 못했습니다.")
                check(result.optString("companyId")==companyId && outstanding.toDouble().isFinite() && outstanding.toDouble()>=0 && unconfirmed.toDouble()>=0 && unconfirmed.toDouble()==kotlin.math.floor(unconfirmed.toDouble()) && unknown.toDouble()>=0 && unknown.toDouble()==kotlin.math.floor(unknown.toDouble())) { "미수금을 확인하지 못했습니다." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantReceivableSites(expectedUser:String,companyId:String,filter:String,page:Int,query:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(companyId) && filter in listOf("unpaid","settled","all") && page in 0..100000 && query.length<=100)
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val url="https://interior-film-ai.vercel.app/api/admin/assistant-receivables?view=items&filter="+filter+"&page="+page+"&q="+Uri.encode(query)
            val c=SecureTransport.open(url)
            try {
                c.requestMethod="GET";c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Assistant-Company",companyId);c.setRequestProperty("Cache-Control","no-store")
                check(c.responseCode in 200..299) { "현장별 미수금을 확인하지 못했습니다." }
                val result=JSONObject(c.inputStream.use { SecureTransport.readBounded(it,128*1024) }.toString(Charsets.UTF_8))
                val items=result.optJSONArray("items") ?: error("현장별 미수금 목록을 확인하지 못했습니다.")
                val count=result.opt("count") as? Number ?: error("현장 수를 확인하지 못했습니다.")
                check(result.optString("companyId")==companyId && result.optString("filter")==filter && result.optInt("page",-1)==page && result.optString("query")==query &&
                    count.toDouble().isFinite() && count.toDouble()>=0 && count.toDouble()==kotlin.math.floor(count.toDouble()) && count.toDouble()<=Int.MAX_VALUE && items.length()<=10 && items.length()<=count.toInt()) { "현장별 미수금을 확인하지 못했습니다." }
                for(i in 0 until items.length()) {
                    val row=items.optJSONObject(i) ?: error("현장 정보를 확인하지 못했습니다.")
                    check(Regex("^[0-9a-fA-F-]{36}$").matches(row.optString("id")) && row.opt("confirmed") is Boolean &&
                        listOf("contract_amount","paid","outstanding").all { k -> row.has(k) && (row.isNull(k) || (row.opt(k) as? Number)?.toDouble()?.isFinite()==true) }) { "현장 금액을 확인하지 못했습니다." }
                }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantSitePayment(expectedUser:String,companyId:String,siteId:String,body:JSONObject?=null):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(companyId) && Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        if(body!=null) require(body.optString("siteId")==siteId && body.optString("action") in listOf("initialize","add"))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val path=if(body==null) "?view=detail&siteId="+Uri.encode(siteId) else ""
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/assistant-receivables"+path)
            try {
                c.requestMethod=if(body==null) "GET" else "POST"
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("X-Assistant-Company",companyId);c.setRequestProperty("Cache-Control","no-store")
                if(body!=null) { c.doOutput=true;c.setRequestProperty("Content-Type","application/json; charset=utf-8");c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
                val status=c.responseCode
                val stream=if(status in 200..299)c.inputStream else c.errorStream
                val result=try { JSONObject(stream?.use { SecureTransport.readBounded(it,128*1024) }?.toString(Charsets.UTF_8).orEmpty()) } catch(_:Exception) { JSONObject() }
                if(status !in 200..299) throw TradeApiFailure(status,result.optString("error").ifBlank { "입금 내역을 확인하지 못했습니다." })
                val site=result.optJSONObject("site") ?: error("현장 입금 정보를 확인하지 못했습니다.")
                val revision=site.opt("revision") as? Number ?: error("입금 내역 버전을 확인하지 못했습니다.")
                check(result.optString("companyId")==companyId && site.optString("company_id")==companyId && site.optString("id")==siteId &&
                    site.optString("status")=="completed" && site.opt("confirmed") is Boolean && revision.toDouble().isFinite() && revision.toDouble()>=0 &&
                    revision.toDouble()==kotlin.math.floor(revision.toDouble()) && revision.toDouble()<=Int.MAX_VALUE &&
                    listOf("contract_amount","paid","outstanding").all { key -> site.has(key) && (site.isNull(key) || (site.opt(key) as? Number)?.toDouble()?.isFinite()==true) }) { "현장 입금 정보를 확인하지 못했습니다." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun submitAssistantWorkerReport(expectedUser:String,companyId:String,siteId:String,region:String,summary:String,memo:String,labor:JSONArray):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체를 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId) && summary.isNotBlank())
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/worker/site-work-report")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.doOutput=true;c.connectTimeout=15000;c.readTimeout=90000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json; charset=utf-8")
                val body=JSONObject().put("siteId",siteId).put("work_region",region).put("work_summary",summary).put("memo",memo)
                    .put("materials",JSONArray()).put("expenses",JSONArray()).put("labor",labor)
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(code in 400..499 && code!=408) error(result.optString("error").ifBlank { "완료보고를 제출하지 못했습니다." })
                check(code in 200..299 && result.optBoolean("success") && result.optString("reportId").takeUnless { it.isBlank() || it=="null" }!=null) { "제출 결과를 확인하지 못했습니다. 다시 제출하기 전에 보고서 상태를 확인해 주세요." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun resubmitAssistantWorkerReport(expectedUser:String,companyId:String,siteId:String,reportId:String,updatedAt:String,region:String,summary:String,memo:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체를 확인해 주세요." }
        val uuid=Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        require(uuid.matches(siteId) && uuid.matches(reportId) && updatedAt.isNotBlank() && summary.isNotBlank())
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/worker/site-work-report/resubmit")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.doOutput=true;c.connectTimeout=15000;c.readTimeout=90000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json; charset=utf-8")
                val body=JSONObject().put("siteId",siteId).put("reportId",reportId).put("updatedAt",updatedAt)
                    .put("region",region).put("summary",summary).put("memo",memo)
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val status=c.responseCode;val stream=if(status in 200..299)c.inputStream else c.errorStream
                val response=try { JSONObject(stream?.use { SecureTransport.readBounded(it,128*1024) }?.toString(Charsets.UTF_8).orEmpty()) } catch(_:Exception) { JSONObject() }
                if(status !in 200..299) throw TradeApiFailure(status,response.optString("error").ifBlank { "재제출 결과를 확인하지 못했습니다." })
                check(response.optBoolean("success") && response.optString("reportId")==reportId && response.optString("review_status")=="pending") { "재제출 결과를 확인하지 못했습니다. 보고서 상태를 다시 확인해 주세요." }
                response
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantReportExpenses(expectedUser:String,companyId:String,siteId:String):JSONArray {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체를 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/site-expenses?siteId="+siteId+"&view=worker")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299 && result.optBoolean("success")) { result.optString("error").ifBlank { "경비를 조회하지 못했습니다." } }
                result.optJSONArray("expenses") ?: error("경비 조회 결과를 확인하지 못했습니다.")
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantReportSupport(expectedUser:String,companyId:String,siteId:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체를 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/report-support?siteId="+siteId)
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299) { result.optString("error").ifBlank { "완료보고 준비 상태를 확인하지 못했습니다." } }
                check(result.has("afterCount") && result.opt("afterCount") is Number && result.optInt("afterCount",-1)>=0 && result.optJSONObject("operations")?.optJSONArray("materials")!=null) { "완료보고 준비 결과를 확인하지 못했습니다." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun uploadAssistantReportPhoto(expectedUser:String,companyId:String,siteId:String,type:String,bytes:ByteArray,mime:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체를 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId) && type in listOf("before","after"))
        val ext=when(mime) { "image/jpeg","image/jpg" -> "jpg";"image/png" -> "png";"image/webp" -> "webp";"image/heic" -> "heic";"image/heif" -> "heif";else -> error("지원하지 않는 사진 형식입니다.") }
        require(bytes.isNotEmpty() && bytes.size<=4*1024*1024)
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val boundary="assistant-"+java.util.UUID.randomUUID().toString()
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/worker/site-photos")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.doOutput=true;c.connectTimeout=15000;c.readTimeout=90000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","multipart/form-data; boundary="+boundary)
                c.outputStream.use { out ->
                    fun field(name:String,value:String) { out.write(("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n").toByteArray(Charsets.UTF_8)) }
                    field("siteId",siteId);field("photoType",type)
                    out.write(("--$boundary\r\nContent-Disposition: form-data; name=\"photos\"; filename=\"photo.$ext\"\r\nContent-Type: $mime\r\n\r\n").toByteArray(Charsets.UTF_8))
                    out.write(bytes);out.write(("\r\n--$boundary--\r\n").toByteArray(Charsets.UTF_8))
                }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(code in 400..499 && code!=408) error(result.optString("error").ifBlank { "사진 등록 권한과 현장을 확인해 주세요." })
                check(code in 200..299 && result.optBoolean("success") && result.optString("site_id")==siteId && result.optInt("count")==1) { "사진 등록 결과를 확인하지 못했습니다. 다시 올리기 전에 기존 사진을 확인해 주세요." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantAdminReview(expectedUser:String,companyId:String,siteId:String,body:JSONObject?=null):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        val uuid=Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        require(uuid.matches(companyId) && uuid.matches(siteId))
        if(body!=null) require(body.optString("siteId")==siteId && body.optString("action") in listOf("approve","reject") && uuid.matches(body.optString("expectedReportId")) && body.optString("expectedUpdatedAt").isNotBlank())
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val base="https://interior-film-ai.vercel.app/api/admin/site-work-report-review"
            val c=SecureTransport.open(base+(if(body==null) "?siteId="+siteId else "/action"))
            try {
                c.instanceFollowRedirects=false;c.requestMethod=if(body==null) "GET" else "POST";c.connectTimeout=15000;c.readTimeout=90000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(body!=null) { c.doOutput=true;c.setRequestProperty("Content-Type","application/json; charset=utf-8");c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
                val status=c.responseCode;val stream=if(status in 200..299)c.inputStream else c.errorStream
                val result=try { JSONObject(stream?.use { SecureTransport.readBounded(it,1024*1024) }?.toString(Charsets.UTF_8).orEmpty()) } catch(_:Exception) { JSONObject() }
                if(status !in 200..299 || !result.optBoolean("success")) throw TradeApiFailure(status,result.optString("error").ifBlank { "완료보고를 확인하지 못했습니다." })
                if(body==null) {
                    check(result.optJSONObject("site")?.let { it.optString("id")==siteId && it.optString("company_id")==companyId }==true) { "현장 정보를 확인하지 못했습니다." }
                    if(result.optBoolean("hasReport")) check(result.optJSONObject("report")?.let { it.optString("site_id")==siteId && it.optString("company_id")==companyId }==true) { "보고서 정보를 확인하지 못했습니다." }
                } else check(result.optJSONObject("report")?.let { it.optString("site_id")==siteId && it.optString("id")==body.optString("expectedReportId") && it.optString("review_status")==(if(body.optString("action")=="approve") "approved" else "rejected") }==true) { "처리 결과를 확인하지 못했습니다. 보고서 상태를 다시 확인해 주세요." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantWorkReport(expectedUser:String,companyId:String,siteId:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId }) { "계정 또는 업체를 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/worker/site-work-report?siteId="+siteId)
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299 && result.optBoolean("success") && result.optString("siteId")==siteId) { result.optString("error").ifBlank { "완료보고를 확인하지 못했습니다." } }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantAssignments(expectedUser:String,companyId:String,siteId:String):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId) && Regex("^[0-9a-fA-F-]{36}$").matches(companyId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            fun get(url:String,publicKey:Boolean):String {
                val c=SecureTransport.open(url)
                try {
                    c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                    c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                    if(publicKey) c.setRequestProperty("apikey",SUPABASE_PUBLIC_KEY)
                    val code=c.responseCode
                    val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                    check(code in 200..299) { "시공 일정과 배정을 확인하지 못했습니다." }
                    return raw
                } finally { c.disconnect() }
            }
            val result=JSONObject(get("https://interior-film-ai.vercel.app/api/site-daily-assignments?siteId="+siteId,false))
            check(result.optBoolean("success") && result.optJSONArray("assignments")!=null && result.optJSONArray("dates")!=null && result.optJSONObject("site")?.optString("id")==siteId) { "시공 일정 결과를 확인하지 못했습니다." }
            val workers=JSONArray();var offset=0
            while(true) {
                val batch=JSONArray(get(SUPABASE_URL+"/rest/v1/workers?select=id,name,company_id,is_active&company_id=eq."+companyId+"&order=id.asc&limit=500&offset="+offset,true))
                for(i in 0 until batch.length()) { val row=batch.getJSONObject(i);check(row.optString("company_id")==companyId);workers.put(row) }
                if(batch.length()<500) break
                offset+=batch.length();check(offset<10000) { "시공자가 많아 목록을 불러오지 못했습니다." }
            }
            result.put("workers",workers)
        }
    }
    suspend fun submitAssistantAssignments(expectedUser:String,companyId:String,siteId:String,days:JSONArray,preview:Boolean,confirmConflicts:Boolean=false):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/site-daily-assignments"+(if(preview) "/preview" else ""))
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.doOutput=true;c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json; charset=utf-8")
                c.outputStream.use { it.write(JSONObject().put("siteId",siteId).put("days",days).put("confirmScheduleConflicts",confirmConflicts).toString().toByteArray(Charsets.UTF_8)) }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299 && result.optBoolean("success")) { result.optString("error").ifBlank { "배정을 처리하지 못했습니다." } }
                if(preview) check(result.optBoolean("preview") && result.optJSONArray("warnings")!=null && result.optJSONArray("pendingWages")!=null && result.optJSONArray("missingLeaders")!=null) { "배정 사전 확인 결과를 확인하지 못했습니다." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantQuote(expectedUser:String,companyId:String,siteId:String,document:JSONObject?=null,revision:Int=0):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/consultation-quote?siteId="+siteId)
            try {
                c.instanceFollowRedirects=false;c.requestMethod=if(document==null) "GET" else "POST";c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(document!=null) {
                    c.doOutput=true;c.setRequestProperty("Content-Type","application/json; charset=utf-8")
                    c.outputStream.use { it.write(JSONObject().put("document",document).put("revision",revision).toString().toByteArray(Charsets.UTF_8)) }
                }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299) { result.optString("error").ifBlank { "견적서를 처리하지 못했습니다." } }
                check(result.optJSONObject("document")!=null && result.has("revision")) { "견적서 결과를 확인하지 못했습니다." }
                result
            } finally { c.disconnect() }
        }
    }
    suspend fun updateAssistantSite(expectedUser:String, companyId:String, siteId:String, status:String, fields:JSONObject):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        require(status in listOf("consulting","scheduled","in_progress","completed","cancelled"))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/site-status")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.doOutput=true;c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json; charset=utf-8")
                val body=JSONObject().put("siteId",siteId).put("status",status).put("expectedStatus",status).put("basicInfo",fields)
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299 && result.optBoolean("success")) { result.optString("error").ifBlank { "현장 정보를 저장하지 못했습니다." } }
                val saved=result.optJSONObject("site") ?: error("저장 결과를 확인하지 못했습니다.")
                check(saved.optString("id")==siteId && saved.optString("company_id")==companyId) { "저장된 현장을 확인하지 못했습니다." }
                saved
            } finally { c.disconnect() }
        }
    }
    suspend fun updateAssistantSiteConditional(expectedUser:String,companyId:String,siteId:String,status:String,updatedAt:String?,fields:JSONObject):JSONObject {
        val verified=verify()
        check(verified.userId==expectedUser && verified.companies.any { it.id==companyId && it.role=="관리자" }) { "관리자 권한을 확인해 주세요." }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(siteId))
        require(status in listOf("consulting","scheduled","in_progress","completed","cancelled"))
        val allowed=setOf("customer_name","customer_phone","site_name","address","address_detail","work_description","memo")
        val keys=fields.keys().asSequence().toList()
        require(keys.isNotEmpty() && keys.all { it in allowed })
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val c=SecureTransport.open("https://interior-film-ai.vercel.app/api/admin/site-basic-conditional")
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.doOutput=true;c.connectTimeout=15000;c.readTimeout=30000
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json; charset=utf-8")
                val body=JSONObject().put("siteId",siteId).put("expectedStatus",status).put("expectedUpdatedAt",updatedAt ?: JSONObject.NULL).put("fields",fields)
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val result=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                check(code in 200..299 && result.optBoolean("success")) { if(code==404 || code==405) "안전한 현장 수정 기능이 서버에 아직 적용되지 않았습니다." else result.optString("error").ifBlank { "저장 결과를 확인하지 못했습니다. 현장을 다시 조회해 주세요." } }
                val saved=result.optJSONObject("site") ?: error("저장 결과를 확인하지 못했습니다.")
                check(saved.optString("id")==siteId && saved.optString("company_id")==companyId) { "저장된 현장을 확인하지 못했습니다." }
                saved
            } finally { c.disconnect() }
        }
    }
    /** Fetch one currently accessible site for an app notification without scanning all sites. */
    suspend fun assistantNoticeSite(expectedUser:String,companyId:String,siteId:String):JSONObject? {
        val uuid=Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        require(uuid.matches(companyId) && uuid.matches(siteId))
        val verified=verify()
        check(verified.userId==expectedUser) { "다른 계정입니다." }
        val company=verified.companies.find { it.id==companyId } ?: error("현재 업체 접근 권한이 없습니다.")
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val owner=company.role=="관리자"
            val url=if(owner) SUPABASE_URL+"/rest/v1/sites?select=id,company_id,site_name,customer_phone,status,schedule_start,schedule_end,work_dates,address,address_detail,work_description&company_id=eq."+companyId+"&id=eq."+siteId+"&limit=1"
                else "https://interior-film-ai.vercel.app/api/worker/my-sites?siteId="+siteId
            val c=SecureTransport.open(url)
            try {
                c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                if(owner) c.setRequestProperty("apikey",SUPABASE_PUBLIC_KEY)
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                if(!owner && c.responseCode==404) return@withContext null
                check(c.responseCode==200) { "현장 정보를 확인하지 못했습니다." }
                val raw=c.inputStream.bufferedReader().use { it.readText() }
                val site=if(owner) JSONArray(raw).optJSONObject(0) else JSONObject(raw).optJSONObject("site")
                if(site!=null) check(site.optString("company_id")==companyId && site.optString("id").ifBlank { site.optString("site_id") }==siteId) { "현장 정보를 확인하지 못했습니다." }
                site
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantSites(expectedUser: String, companyId: String, callMatchOnly:Boolean=false,dailyOnly:Boolean=false): JSONArray {
        val verified=verify()
        check(verified.userId==expectedUser) { "다른 계정입니다." }
        val company=verified.companies.find { it.id==companyId } ?: error("현재 업체 접근 권한이 없습니다.")
        if(company.role!="관리자") {
            val assigned=assignedSites(expectedUser);val result=JSONArray()
            for(i in 0 until assigned.length()) assigned.optJSONObject(i)?.takeIf { it.optString("company_id")==companyId }?.let(result::put)
            return result
        }
        require(Regex("^[0-9a-fA-F-]{36}$").matches(companyId))
        val token=client.auth.currentAccessTokenOrNull() ?: error("로그인이 만료됐습니다.")
        return withContext(Dispatchers.IO) {
            val result=JSONArray();var offset=0
            while(true) {
                val fields=if(callMatchOnly) "id,company_id,site_name,address,customer_name,customer_phone" else if(dailyOnly) "id,company_id,site_name,address,address_detail,status,work_dates,schedule_start,schedule_end,work_description" else "id,company_id,site_name,address,address_detail,customer_name,customer_phone,status,work_dates,schedule_start,schedule_end,work_description,memo,created_at,updated_at"
                val url=SUPABASE_URL+"/rest/v1/sites?select="+fields+"&company_id=eq."+companyId+"&order=id.asc&limit=500&offset="+offset
                val c=SecureTransport.open(url)
                val batch=try {
                    c.instanceFollowRedirects=false;c.requestMethod="GET";c.connectTimeout=15000;c.readTimeout=30000
                    c.setRequestProperty("apikey",SUPABASE_PUBLIC_KEY);c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Cache-Control","no-store")
                    check(c.responseCode==200) { "현장 정보를 확인하지 못했습니다." }
                    JSONArray(c.inputStream.bufferedReader().use { it.readText() })
                } finally { c.disconnect() }
                for(i in 0 until batch.length()) {
                    val row=batch.getJSONObject(i);check(row.optString("company_id")==companyId)
                    result.put(row)
                }
                if(batch.length()<500) break
                offset+=batch.length();check(offset<10000) { "현장이 많아 전체 조회를 완료하지 못했습니다. 필름장이 현장 관리에서 확인해 주세요." }
            }
            result
        }
    }
    private fun workerCompanies(token: String): JSONArray {
        val connection=SecureTransport.open("https://interior-film-ai.vercel.app/api/worker/companies")
        try {
            connection.instanceFollowRedirects=false;connection.requestMethod="GET"
            connection.connectTimeout=15000;connection.readTimeout=20000
            connection.setRequestProperty("Authorization","Bearer "+token)
            connection.setRequestProperty("Cache-Control","no-store")
            if(connection.responseCode!=200) throw IllegalStateException("업체 정보를 확인하지 못했습니다.")
            return JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).optJSONArray("companies") ?: JSONArray()
        } finally { connection.disconnect() }
    }
}

