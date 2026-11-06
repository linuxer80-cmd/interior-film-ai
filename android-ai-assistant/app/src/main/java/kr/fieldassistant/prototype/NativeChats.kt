package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.UUID

/** Native views over the existing chat API; no privileged database credentials on device. */
internal class NativeChats(
    private val activity:Activity, private val auth:AccountAuth, private val scope:CoroutineScope,
    private val uid:String, private val company:CompanyAccess, private val valid:()->Boolean
) {
    private var liveJob:Job?=null
    private var startLive:(()->Unit)?=null
    private var currentDialog:AlertDialog?=null
    fun pause() { liveJob?.cancel();liveJob=null }
    fun resume() { startLive?.invoke() }
    fun close() { pause();startLive=null;currentDialog?.dismiss();currentDialog=null }
    private fun dp(n:Int)=(n*activity.resources.displayMetrics.density).toInt()
    private fun label(s:String,size:Float=15f)=TextView(activity).apply { text=s;textSize=size;setPadding(dp(8),dp(8),dp(8),dp(8)) }
    private fun background(color:Int,radius:Int,border:Int?=null)=GradientDrawable().apply {
        setColor(color);cornerRadius=dp(radius).toFloat();if(border!=null) setStroke(dp(1),border)
    }
    private fun toast(s:String)=android.widget.Toast.makeText(activity,s,android.widget.Toast.LENGTH_LONG).show()

    fun customerInbox(offset:Int=0) {
        if(!valid() || company.role!="관리자") return
        scope.launch {
            try {
                val data=auth.nativeChat(uid,company,"customers",offset=offset)
                if(!valid()) return@launch
                val rows=data.getJSONArray("threads")
                val options=mutableListOf<String>();val ids=mutableListOf<String>();val names=mutableListOf<String>()
                for(i in 0 until rows.length()) {
                    val row=rows.optJSONObject(i) ?: continue
                    val id=row.optString("id");if(!id.matches(Regex("^[0-9a-fA-F-]{36}$"))) continue
                    val name=row.optString("customer_name").takeUnless { it.isBlank() || it=="null" } ?: "고객"
                    val incoming=row.optString("last_customer_at").takeUnless { it=="null" }.orEmpty()
                    val read=row.optString("owner_read_at").takeUnless { it=="null" }.orEmpty()
                    val unread=incoming.isNotBlank() && (read.isBlank() || incoming>read)
                    val preview=row.optString("last_preview").takeUnless { it=="null" }.orEmpty().take(60)
                    ids.add(id);names.add(name);options.add((if(unread) "● " else "")+name+if(preview.isBlank()) "" else "\n"+preview)
                }
                val previous=offset>0;val more=data.optBoolean("hasMore")
                if(previous) options.add("이전 목록")
                if(more) options.add("다음 목록")
                if(options.isEmpty()) { toast("아직 고객 채팅이 없습니다.");return@launch }
                val inbox=AlertDialog.Builder(activity).setTitle("고객 채팅").setItems(options.toTypedArray()) { _,index ->
                    if(!valid()) return@setItems
                    when {
                        index<ids.size -> conversation("customer",ids[index],names[index],"")
                        previous && index==ids.size -> customerInbox((offset-50).coerceAtLeast(0))
                        more -> customerInbox(offset+50)
                    }
                }.setNegativeButton("닫기",null).create()
                currentDialog=inbox;inbox.show()
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) toast(e.message ?: "고객 채팅을 불러오지 못했습니다.") }
        }
    }

    fun conversation(kind:String,target:String,title:String,date:String) {
        if(!valid() || kind !in listOf("customer","team")) return
        val root=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(12),dp(8),dp(12),dp(8));setBackgroundColor(Color.rgb(249,247,242)) }
        val status=label(if(kind=="team") "$date · 이 현장에 배정된 팀원과 관리자" else "고객과의 대화",13f).apply { setTextColor(Color.rgb(89,111,96)) }
        val scroll=ScrollView(activity)
        val messages=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(0,dp(8),0,dp(12)) }
        scroll.addView(messages);root.addView(status);root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        val input=EditText(activity).apply { hint="메시지를 입력하세요";textSize=16f;maxLines=4;setPadding(dp(12),dp(10),dp(8),dp(10));background=null;filters=arrayOf(android.text.InputFilter.LengthFilter(2000)) }
        val send=Button(activity).apply { text="보내기";isAllCaps=false;setTextColor(Color.WHITE);background=background(Color.rgb(35,84,59),20);minWidth=dp(66);minimumWidth=dp(66);contentDescription="메시지 보내기" }
        val compose=LinearLayout(activity).apply { gravity=Gravity.CENTER_VERTICAL;setPadding(dp(4),dp(4),dp(4),dp(4));background=background(Color.WHITE,24,Color.rgb(225,229,220));addView(input,LinearLayout.LayoutParams(0,-2,1f));addView(send,LinearLayout.LayoutParams(dp(72),dp(48))) }
        root.addView(compose)
        val dialog=AlertDialog.Builder(activity).setTitle(if(kind=="team") "$title · 팀 채팅" else "$title · 고객 채팅").setView(root).setNegativeButton("닫기",null).setNeutralButton("새로 확인",null).create()
        currentDialog=dialog
        val handler=Handler(Looper.getMainLooper());var closed=false;var loading=false;var pendingRefresh=false;var sending=false
        var lastVersion="";var firstLoad=true;var pendingText="";var pendingId="";var lastAcknowledged="";var chatAllowed=true
        var latestCustomerView:TextView?=null;var latestCustomerAt=""
        val teamViews=linkedMapOf<String,TextView>();val teamRead=mutableSetOf<String>();var teamReadReady=false
        val markVisible=object:Runnable { override fun run() {
            if(closed || !dialog.isShowing || !valid() || kind!="team" || !teamReadReady) return
            val ids=teamViews.filter { (id,view) -> id !in teamRead && view.getGlobalVisibleRect(android.graphics.Rect()) }.keys.take(100)
            if(ids.isEmpty()) return
            teamRead.addAll(ids)
            scope.launch {
                try { auth.nativeChat(uid,company,"team",target,date,"PATCH",JSONObject().put("messageIds",org.json.JSONArray(ids))) }
                catch(e:CancellationException) { throw e }
                catch(_:Exception) { teamRead.removeAll(ids.toSet());if(!closed && dialog.isShowing && valid()) status.text="읽음 상태를 저장하지 못했습니다. 다시 확인해 주세요." }
            }
        } }
        scroll.setOnScrollChangeListener { _,_,_,_,_ -> handler.removeCallbacks(markVisible);handler.postDelayed(markVisible,350) }
        lateinit var refresh:()->Unit
        fun showPhoto(url:String) {
            if(!valid() || !ChatPhotoUrl.allowed(url,target)) { toast("사진을 확인할 수 없습니다.");return }
            val image=ImageView(activity).apply { adjustViewBounds=true;minimumHeight=dp(220);contentDescription="고객이 보낸 사진" }
            val photo=AlertDialog.Builder(activity).setTitle("채팅 사진").setView(image).setPositiveButton("닫기",null).create();photo.show()
            scope.launch {
                val bitmap=withContext(Dispatchers.IO) { try {
                    val c=SecureTransport.open(url)
                    try { if(c.responseCode!=200) null else {
                        val bytes=c.inputStream.use { SecureTransport.readBounded(it,4*1024*1024) }
                        val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true };BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                        if(bounds.outWidth<=0 || bounds.outHeight<=0 || bounds.outWidth>16000 || bounds.outHeight>16000) null else {
                            var sample=1;while(bounds.outWidth/sample>1600 || bounds.outHeight/sample>1600) sample*=2
                            BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().apply { inSampleSize=sample })
                        }
                    } } finally { c.disconnect() }
                } catch(_:Exception) { null } }
                if(photo.isShowing && valid() && bitmap!=null) image.setImageBitmap(bitmap) else bitmap?.recycle()
                if(bitmap==null && photo.isShowing && valid()) toast("사진을 불러오지 못했습니다.")
            }
        }
        refresh=refresh@{
            if(closed || !dialog.isShowing || !valid()) return@refresh
            if(loading) { pendingRefresh=true;return@refresh };loading=true
            scope.launch {
                try {
                    val data=auth.nativeChat(uid,company,kind,target,date)
                    if(closed || !dialog.isShowing || !valid()) return@launch
                    val list=data.getJSONArray("messages");val version=list.toString()
                    if(version!=lastVersion) {
                        val nearBottom=firstLoad || scroll.scrollY+scroll.height>=messages.height-dp(80)
                        messages.removeAllViews();latestCustomerView=null;teamViews.clear()
                        latestCustomerAt=data.optJSONObject("thread")?.optString("last_customer_at").orEmpty().takeUnless { it=="null" }.orEmpty()
                        val members=data.optJSONArray("members")
                        for(i in 0 until list.length()) {
                            val m=list.optJSONObject(i) ?: continue
                            val mine=if(kind=="customer") m.optString("sender")=="owner" else m.optString("sender_id")==uid
                            val sender=if(kind=="customer") { if(mine) "나" else "고객" } else {
                                val id=m.optString("sender_id");(0 until (members?.length() ?: 0)).mapNotNull { members?.optJSONObject(it) }.find { it.optString("user_id")==id }?.optString("name")?.takeIf { it.isNotBlank() } ?: if(mine) "나" else "팀원"
                            }
                            val body=m.optString("body").takeUnless { it=="null" }.orEmpty()
                            val item=label("$sender\n$body\n${m.optString("created_at").take(16).replace('T',' ')}",15f).apply {
                                setTextColor(if(mine) Color.WHITE else Color.rgb(43,62,51))
                                setPadding(dp(14),dp(11),dp(14),dp(11))
                                setLineSpacing(dp(3).toFloat(),1f)
                                maxWidth=(activity.resources.displayMetrics.widthPixels*0.76f).toInt()
                                background=background(if(mine) Color.rgb(35,84,59) else Color.WHITE,16,if(mine) null else Color.rgb(225,229,220))
                            }
                            val row=LinearLayout(activity).apply { gravity=if(mine) Gravity.END else Gravity.START;addView(item) }
                            messages.addView(row,LinearLayout.LayoutParams(-1,-2).apply { setMargins(0,dp(5),0,dp(5)) })
                            if(kind=="customer" && !mine && m.optString("created_at")==latestCustomerAt) latestCustomerView=item
                            if(kind=="team" && !mine && m.optString("id").matches(Regex("^[0-9a-fA-F-]{36}$"))) teamViews[m.optString("id")]=item
                            if(kind=="customer" && m.optBoolean("has_image")) {
                                val url=m.optString("image_url").takeUnless { it=="null" }.orEmpty()
                                messages.addView(Button(activity).apply { text=if(url.isBlank()) "사진을 불러오지 못했습니다" else "사진 보기";isEnabled=url.isNotBlank();setOnClickListener { showPhoto(url) } })
                            }
                        }
                        if(list.length()==0) messages.addView(label("아직 메시지가 없습니다."))
                        if(kind=="customer" && data.optBoolean("hasOlder")) messages.addView(label("이전 대화가 더 있습니다.",12f),0)
                        lastVersion=version;firstLoad=false
                        if(nearBottom) scroll.post { scroll.fullScroll(android.view.View.FOCUS_DOWN) }
                    }
                    teamReadReady=kind=="team" && data.optBoolean("readReady")
                    if(teamReadReady) { handler.removeCallbacks(markVisible);handler.postDelayed(markVisible,500) }
                    chatAllowed=kind!="team" || data.optBoolean("chatReady");send.isEnabled=chatAllowed && !sending
                    // Do not mark unseen team messages read. Customer acknowledgement is made only when the latest customer message is visible.
                    if(kind=="customer") {
                        val seen=data.optJSONObject("thread")?.optString("last_customer_at").orEmpty().takeUnless { it=="null" }.orEmpty()
                        if(seen.isNotBlank() && seen!=lastAcknowledged) scroll.post {
                            val rect=android.graphics.Rect()
                            if(!closed && dialog.isShowing && valid() && latestCustomerAt==seen && latestCustomerView?.getGlobalVisibleRect(rect)==true) {
                                lastAcknowledged=seen
                                scope.launch { try { auth.nativeChat(uid,company,"customer",target,method="POST",body=JSONObject().put("action","read").put("seenAt",seen)) }
                                    catch(e:CancellationException) { throw e } catch(_:Exception) { lastAcknowledged="" } }
                            }
                        }
                    }
                } catch(e:CancellationException) { throw e }
                  catch(e:Exception) { if(!closed && dialog.isShowing && valid()) { messages.removeAllViews();teamViews.clear();latestCustomerView=null;lastVersion="";status.text=e.message ?: "대화를 불러오지 못했습니다. 다시 확인해 주세요." } }
                finally { loading=false;if(pendingRefresh && !closed && dialog.isShowing) { pendingRefresh=false;refresh() } }
            }
        }
        send.setOnClickListener {
            val text=input.text.toString().trim()
            if(!valid() || sending || text.isBlank() || text.length>2000) return@setOnClickListener
            if(text!=pendingText || pendingId.isBlank()) { pendingText=text;pendingId=UUID.randomUUID().toString() }
            val id=pendingId;sending=true;send.isEnabled=false
            val payload=if(kind=="customer") JSONObject().put("messageId",id).put("text",text) else JSONObject().put("id",id).put("body",text)
            scope.launch {
                try {
                    auth.nativeChat(uid,company,kind,target,date,"POST",payload)
                    if(!closed && dialog.isShowing && valid()) {
                        if(input.text.toString().trim()==text) input.setText("")
                        pendingId="";pendingText="";firstLoad=true;refresh()
                    }
                } catch(e:CancellationException) { throw e }
                  catch(e:Exception) { if(!closed && dialog.isShowing && valid()) toast((e.message ?: "전송 결과를 확인하지 못했습니다.")+" 같은 내용을 다시 보내면 중복을 확인합니다.") }
                finally { sending=false;if(!closed && dialog.isShowing) send.isEnabled=chatAllowed }
            }
        }
        startLive=start@{
            if(closed || !dialog.isShowing || !valid() || liveJob?.isActive==true) return@start
            liveJob=scope.launch {
                var attempt=0
                while(!closed && dialog.isShowing && valid()) {
                    try {
                        status.text="실시간 연결 중…"
                        auth.watchChat(uid,company,kind,target,date,
                            onChange={ if(!closed && dialog.isShowing && valid()) refresh() },
                            onState={ connected -> if(!closed && dialog.isShowing && valid()) {
                                status.text=if(connected) (if(kind=="team") "$date · 팀원과 실시간 대화" else "고객과 실시간 대화") else "실시간 연결을 확인 중입니다."
                                if(connected) attempt=0
                            } })
                    } catch(e:CancellationException) { throw e }
                      catch(_:Exception) { if(!closed && dialog.isShowing && valid()) status.text="실시간 연결이 끊겼습니다. 다시 연결합니다." }
                    if(!closed && dialog.isShowing && valid()) { attempt=(attempt+1).coerceAtMost(6);delay((attempt*5000L).coerceAtMost(30000L)) }
                }
            }
        }
        dialog.setOnDismissListener { closed=true;pause();startLive=null;handler.removeCallbacks(markVisible);if(currentDialog===dialog) currentDialog=null }
        dialog.setOnShowListener {
            dialog.window?.setLayout(-1,(activity.resources.displayMetrics.heightPixels*0.9).toInt())
            dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener { if(valid()) refresh() }
            refresh();resume()
        }
        dialog.show()
    }
}

/** Only the current thread's signed Supabase Storage URL may be opened. */
internal object ChatPhotoUrl {
    fun allowed(raw:String,thread:String):Boolean=try {
        val uri=java.net.URI(SecureTransport.requireHttps(raw));val server=java.net.URI(SUPABASE_URL)
        val path=uri.path.orEmpty()
        uri.host.equals(server.host,true) && uri.port in listOf(-1,443) &&
            thread.matches(Regex("^[0-9a-fA-F-]{36}$")) &&
            path.startsWith("/storage/v1/object/sign/customer-chat/$thread/") && !path.split('/').contains("..")
    } catch(_:Exception) { false }
}
