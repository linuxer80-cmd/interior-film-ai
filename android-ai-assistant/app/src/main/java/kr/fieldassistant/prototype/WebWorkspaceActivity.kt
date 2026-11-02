package kr.fieldassistant.prototype

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.print.PrintManager
import android.webkit.*
import android.widget.*
import android.view.View
import org.json.JSONObject

/** Existing business UI in an isolated, same-origin web workspace. No token or JS bridge. */
class WebWorkspaceActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private var upload: ValueCallback<Array<Uri>>?=null
    private var geoCallback: GeolocationPermissions.Callback?=null
    private var geoOrigin=""
    private var mediaRequest: PermissionRequest?=null
    private var downloadBytes: ByteArray?=null
    private val handler=Handler(Looper.getMainLooper())
    private val origin="https://interior-film-ai.vercel.app"
    private fun trusted(url:String?):Boolean=try { val u=Uri.parse(url);u.scheme=="https" && u.host=="interior-film-ai.vercel.app" && (u.port==-1 || u.port==443) && u.userInfo==null } catch(_:Exception) { false }
    private fun notice(value:String)=Toast.makeText(this,value,Toast.LENGTH_LONG).show()
    override fun onCreate(state:Bundle?) {
        super.onCreate(state)
        window.setDecorFitsSystemWindows(false)
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        val target=intent.getStringExtra("url") ?: origin
        if(!trusted(target)) { finish();return }
        val page=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.WHITE)
            setOnApplyWindowInsetsListener { v,i -> val a=i.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout() or android.view.WindowInsets.Type.ime());v.setPadding(a.left,a.top,a.right,a.bottom);android.view.WindowInsets.CONSUMED }
        }
        val toolbar=LinearLayout(this)
        toolbar.addView(Button(this).apply { text="‹ 비서";setOnClickListener { finish() } },LinearLayout.LayoutParams(0,-2,1f))
        toolbar.addView(Button(this).apply { text="새로고침";setOnClickListener { web.reload() } },LinearLayout.LayoutParams(0,-2,1f))
        toolbar.addView(Button(this).apply { text="더보기";setOnClickListener {
            AlertDialog.Builder(this@WebWorkspaceActivity).setItems(arrayOf("인쇄 · PDF 저장","외부 브라우저에서 열기")) { _,which ->
                if(which==0) (getSystemService(Context.PRINT_SERVICE) as PrintManager).print("필름장이",web.createPrintDocumentAdapter("필름장이"),null)
                else external(web.url ?: target)
            }.show()
        } },LinearLayout.LayoutParams(0,-2,1f))
        page.addView(toolbar)
        page.addView(TextView(this).apply { text="필름장이 · "+intent.getStringExtra("company").orEmpty()+"\n처음에는 같은 계정으로 로그인해 주세요.";textSize=12f;setPadding(16,6,16,6);setTextColor(Color.DKGRAY) })
        progress=ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);page.addView(progress,LinearLayout.LayoutParams(-1,5))
        web=WebView(this)
        web.settings.apply {
            javaScriptEnabled=true;domStorageEnabled=true;allowFileAccess=false;allowContentAccess=true
            mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically=false;setSupportMultipleWindows(true)
            setGeolocationEnabled(true)
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false)
        web.webViewClient=object:WebViewClient() {
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                val url=request.url.toString()
                if(trusted(url)) return false
                if(request.isForMainFrame) external(url)
                return true
            }
            override fun onReceivedSslError(view:WebView,handler:SslErrorHandler,error:android.net.http.SslError) { handler.cancel();notice("보안 연결을 확인하지 못했습니다.") }
            override fun onReceivedError(view:WebView,request:WebResourceRequest,error:WebResourceError) { if(request.isForMainFrame) notice("화면을 불러오지 못했습니다. 인터넷 연결 후 새로고침해 주세요.") }
            override fun onPageFinished(view:WebView,url:String) { CookieManager.getInstance().flush() }
        }
        web.webChromeClient=object:WebChromeClient() {
            override fun onProgressChanged(view:WebView,value:Int) { progress.progress=value;progress.visibility=if(value==100) View.GONE else View.VISIBLE }
            override fun onShowFileChooser(view:WebView,callback:ValueCallback<Array<Uri>>,params:FileChooserParams):Boolean {
                if(!trusted(view.url)) { callback.onReceiveValue(null);return true }
                upload?.onReceiveValue(null);upload=callback
                try { startActivityForResult(params.createIntent(),501) } catch(_:Exception) { upload?.onReceiveValue(null);upload=null;notice("파일 선택창을 열 수 없습니다.") }
                return true
            }
            override fun onCreateWindow(view:WebView,isDialog:Boolean,isUserGesture:Boolean,result:android.os.Message):Boolean {
                if(!isUserGesture) return false
                val popup=WebView(this@WebWorkspaceActivity)
                popup.webViewClient=object:WebViewClient() {
                    override fun shouldOverrideUrlLoading(v:WebView,r:WebResourceRequest):Boolean {
                        val url=r.url.toString();if(trusted(url)) web.loadUrl(url) else external(url)
                        v.destroy();return true
                    }
                }
                (result.obj as WebView.WebViewTransport).webView=popup;result.sendToTarget();return true
            }
            override fun onGeolocationPermissionsShowPrompt(requestOrigin:String,callback:GeolocationPermissions.Callback) {
                if(!trusted(requestOrigin) || !trusted(web.url)) { callback.invoke(requestOrigin,false,false);return }
                if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) callback.invoke(requestOrigin,true,false)
                else { geoCallback?.invoke(geoOrigin,false,false);geoOrigin=requestOrigin;geoCallback=callback;requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),502) }
            }
            override fun onPermissionRequest(request:PermissionRequest) {
                if(!trusted(request.origin.toString()) || !trusted(web.url)) { request.deny();return }
                val permissions=request.resources.mapNotNull { when(it) { PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO;PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA;else -> null } }.distinct()
                if(permissions.isEmpty()) { request.deny();return }
                mediaRequest?.deny();mediaRequest=request
                if(permissions.all { checkSelfPermission(it)==PackageManager.PERMISSION_GRANTED }) finishMediaPermission()
                else requestPermissions(permissions.toTypedArray(),503)
            }
            override fun onPermissionRequestCanceled(request:PermissionRequest) { if(mediaRequest==request) mediaRequest=null }
        }
        web.setDownloadListener { url,agent,disposition,mime,_ ->
            if(url.startsWith("blob:$origin/")) saveBlob(url,mime)
            else if(Uri.parse(url).scheme=="https") {
                try {
                    val request=DownloadManager.Request(Uri.parse(url)).setTitle(URLUtil.guessFileName(url,disposition,mime))
                        .setMimeType(mime).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,URLUtil.guessFileName(url,disposition,mime))
                    request.addRequestHeader("User-Agent",agent)
                    if(trusted(url)) CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie",it) }
                    (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request);notice("다운로드를 시작했습니다.")
                } catch(_:Exception) { notice("다운로드하지 못했습니다. 더보기에서 브라우저로 열어 주세요.") }
            }
        }
        page.addView(web,LinearLayout.LayoutParams(-1,0,1f));setContentView(page);page.requestApplyInsets()
        // Web sessions stay in WebView storage; no native credentials are copied into URLs or JavaScript.
        val binding=getSharedPreferences("web_workspace_account",Context.MODE_PRIVATE)
        val user=intent.getStringExtra("user").orEmpty()
        fun loadTarget() { web.loadUrl(origin+"/login?next="+Uri.encode(Uri.parse(target).encodedPath.orEmpty()+Uri.parse(target).encodedQuery?.let { "?$it" }.orEmpty())) }
        if(binding.getString("user",null)!=user) {
            WebStorage.getInstance().deleteAllData();web.clearCache(true)
            CookieManager.getInstance().removeAllCookies { binding.edit().putString("user",user).apply();if(!isFinishing && !isDestroyed) loadTarget() }
        } else if(state==null || web.restoreState(state)==null) loadTarget()
    }
    private fun external(url:String) {
        try {
            val uri=Uri.parse(url)
            when(uri.scheme?.lowercase()) {
                "tel" -> startActivity(Intent(Intent.ACTION_DIAL,uri))
                "https","http","geo","google.navigation","kakaomap","nmap","tmap","mailto","sms" -> startActivity(Intent(Intent.ACTION_VIEW,uri))
                else -> notice("지원하지 않는 외부 연결입니다.")
            }
        } catch(_:Exception) { notice("연결할 앱을 찾지 못했습니다.") }
    }
    private fun finishMediaPermission() {
        val r=mediaRequest ?: return;mediaRequest=null
        val allowed=r.resources.filter { when(it) { PermissionRequest.RESOURCE_AUDIO_CAPTURE -> checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;PermissionRequest.RESOURCE_VIDEO_CAPTURE -> checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED;else -> false } }
        if(allowed.isEmpty() || !trusted(web.url)) r.deny() else r.grant(allowed.toTypedArray())
    }
    override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,results:IntArray) {
        super.onRequestPermissionsResult(code,permissions,results)
        if(code==502) { geoCallback?.invoke(geoOrigin,trusted(web.url) && results.any { it==PackageManager.PERMISSION_GRANTED },false);geoCallback=null }
        if(code==503) finishMediaPermission()
    }
    private fun saveBlob(url:String,mime:String?) {
        if(!trusted(web.url) || downloadBytes!=null) return
        val key="assistantDownload"+java.util.UUID.randomUUID().toString().replace("-","")
        val js="fetch("+JSONObject.quote(url)+").then(r=>r.blob()).then(b=>{if(b.size>20971520)throw Error();let f=new FileReader();f.onload=()=>window['$key']=f.result;f.onerror=()=>window['$key']='error';f.readAsDataURL(b)}).catch(()=>window['$key']='error');"
        web.evaluateJavascript(js,null)
        fun poll(attempt:Int) {
            if(isFinishing || isDestroyed || !trusted(web.url)) return
            web.evaluateJavascript("window['$key'] || null") { result ->
                if(result=="null" && attempt<100) handler.postDelayed({ poll(attempt+1) },150)
                else {
                    web.evaluateJavascript("delete window['$key']",null)
                    try {
                        val data=org.json.JSONTokener(result).nextValue() as? String ?: error("download")
                        require(data.startsWith("data:") && data.contains(";base64,"))
                        downloadBytes=android.util.Base64.decode(data.substringAfter(","),android.util.Base64.DEFAULT)
                        val type=mime?.takeIf { it.contains('/') } ?: "application/octet-stream"
                        startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type).putExtra(Intent.EXTRA_TITLE,if(type=="application/pdf") "필름장이.pdf" else "필름장이-파일"),504)
                    } catch(_:Exception) { downloadBytes=null;notice("파일을 저장하지 못했습니다. PDF는 더보기의 인쇄 · PDF 저장도 사용할 수 있습니다.") }
                }
            }
        }
        poll(0)
    }
    @Deprecated("Activity result")
    override fun onActivityResult(code:Int,result:Int,data:Intent?) {
        super.onActivityResult(code,result,data)
        if(code==501) { upload?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));upload=null }
        if(code==504) {
            val bytes=downloadBytes;downloadBytes=null
            val uri=data?.data
            if(result==RESULT_OK && uri!=null && bytes!=null) Thread {
                val ok=try { contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("write");true } catch(_:Exception) { false }
                runOnUiThread { notice(if(ok) "파일을 저장했습니다." else "파일을 저장하지 못했습니다.") }
            }.start()
        }
    }
    override fun onSaveInstanceState(state:Bundle) { if(::web.isInitialized) web.saveState(state);super.onSaveInstanceState(state) }
    @Deprecated("Back callback")
    override fun onBackPressed() { if(web.canGoBack()) web.goBack() else finish() }
    override fun onDestroy() { upload?.onReceiveValue(null);geoCallback?.invoke(geoOrigin,false,false);mediaRequest?.deny();handler.removeCallbacksAndMessages(null);if(::web.isInitialized) web.destroy();super.onDestroy() }
}
