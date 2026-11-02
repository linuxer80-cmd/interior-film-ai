package kr.fieldassistant.prototype

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

internal object KakaoOAuth {
    fun begin(context:Context):Uri {
        val verifier=OAuthProof.random();val state=OAuthProof.random()
        SecureSessionManager(context).storePending(JSONObject().put("verifier",verifier).put("state",state).put("created",System.currentTimeMillis()).toString())
        val redirect=Uri.parse("https://interior-film-ai.vercel.app/auth/kakao").buildUpon()
            .appendQueryParameter("assistant_state",state).build().toString()
        return Uri.parse(SUPABASE_URL+"/auth/v1/authorize").buildUpon()
            .appendQueryParameter("provider","kakao").appendQueryParameter("redirect_to",redirect)
            .appendQueryParameter("code_challenge",OAuthProof.challenge(verifier))
            .appendQueryParameter("code_challenge_method","s256").build()
    }
    fun consume(context:Context,uri:Uri?):Pair<String,String> {
        require(uri?.scheme=="filmjang-assistant" && uri.host=="auth" && uri.path=="/kakao" && uri.port==-1 && uri.userInfo==null)
        val store=SecureSessionManager(context)
        val saved=JSONObject(store.pending() ?: error("expired"))
        require(OAuthProof.validState(saved.getString("state"),uri!!.getQueryParameter("state").orEmpty(),saved.getLong("created"),System.currentTimeMillis()))
        store.clearPending()
        require(uri.getQueryParameter("error")==null)
        val code=uri.getQueryParameter("code").orEmpty()
        require(Regex("[A-Za-z0-9._~-]{1,2048}").matches(code))
        return code to saved.getString("verifier")
    }
    suspend fun exchange(code:String,verifier:String):String=withContext(Dispatchers.IO) {
        val connection=URL(SUPABASE_URL+"/auth/v1/token?grant_type=pkce").openConnection() as HttpsURLConnection
        try {
            connection.requestMethod="POST";connection.instanceFollowRedirects=false
            connection.connectTimeout=15000;connection.readTimeout=20000;connection.doOutput=true
            connection.setRequestProperty("apikey",SUPABASE_PUBLIC_KEY)
            connection.setRequestProperty("Content-Type","application/json")
            connection.outputStream.use { it.write(JSONObject().put("auth_code",code).put("code_verifier",verifier).toString().toByteArray(Charsets.UTF_8)) }
            require(connection.responseCode==200)
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally { connection.disconnect() }
    }
}

class KakaoCallbackActivity:Activity() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
    override fun onCreate(state:Bundle?) {
        super.onCreate(state)
        val page=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(32,80,32,32) }
        val status=TextView(this).apply { text="카카오 로그인 확인 중…";textSize=18f };page.addView(status);setContentView(page)
        val payload=try { KakaoOAuth.consume(this,intent.data) } catch(_:Exception) { null }
        intent.data=null
        fun failed() {
            status.text="로그인이 취소되었거나 유효 시간이 지났습니다. 연결된 업체가 없는 계정도 사용할 수 없습니다. 기존 가입 방법을 확인하고 다시 시도해 주세요."
            page.addView(Button(this).apply { text="로그인으로 돌아가기";setOnClickListener { returnToApp(false) } })
        }
        if(payload==null) { failed();return }
        scope.launch {
            try {
                val raw=KakaoOAuth.exchange(payload.first,payload.second)
                AccountAuth.shared(applicationContext).importKakaoSession(raw)
                returnToApp(true)
            } catch(e:CancellationException) { throw e } catch(_:Exception) { failed() }
        }
    }
    private fun returnToApp(success:Boolean) {
        startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("oauth_complete",success));finish()
    }
    override fun onDestroy() { scope.cancel();super.onDestroy() }
}
