package kr.fieldassistant.prototype

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.security.KeyStore
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection

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

internal data class CompanyAccess(val id: String, val name: String, val role: String)
internal data class VerifiedAccount(val userId: String, val companies: List<CompanyAccess>)

internal class AccountAuth private constructor(context: Context) {
    companion object {
        @Volatile private var instance: AccountAuth?=null
        fun shared(context: Context): AccountAuth = instance ?: synchronized(this) {
            instance ?: AccountAuth(context.applicationContext).also { instance=it }
        }
    }
    private val client=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLIC_KEY) {
        install(Auth) { sessionManager=SecureSessionManager(context); autoLoadFromStorage=true; autoSaveToStorage=true }
        install(Postgrest) { requireValidSession=true }
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
            val c=URL("https://interior-film-ai.vercel.app/api/worker/my-sites").openConnection() as HttpsURLConnection
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
            val c=URL("https://interior-film-ai.vercel.app/api/site-expenses").openConnection() as HttpsURLConnection
            try {
                c.instanceFollowRedirects=false;c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=30000;c.doOutput=true
                c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json")
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val code=c.responseCode
                val raw=(if(code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                val response=try { JSONObject(raw) } catch(_:Exception) { JSONObject() }
                if(code !in 200..299 || !response.optBoolean("success")) throw IllegalStateException(response.optString("error").ifBlank { "경비 저장 결과를 확인하지 못했습니다." })
                response
            } finally { c.disconnect() }
        }
    }
    suspend fun assistantSites(expectedUser: String, companyId: String): JSONArray {
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
                val fields="id,company_id,site_name,address,address_detail,customer_name,customer_phone,status,work_dates,schedule_start,schedule_end,work_description"
                val url=SUPABASE_URL+"/rest/v1/sites?select="+fields+"&company_id=eq."+companyId+"&order=id.asc&limit=500&offset="+offset
                val c=URL(url).openConnection() as HttpsURLConnection
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
        val connection=URL("https://interior-film-ai.vercel.app/api/worker/companies").openConnection() as HttpsURLConnection
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

