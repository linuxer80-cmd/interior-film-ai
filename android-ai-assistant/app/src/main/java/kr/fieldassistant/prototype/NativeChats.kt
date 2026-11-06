package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
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
    private var inboxListener:((ChatPushTarget)->Unit)?=null
    private var refreshInbox:(()->Unit)?=null
    fun pause() { liveJob?.cancel();liveJob=null;inboxListener?.let { ChatInboxEvents.detach(it) } }
    fun resume() { inboxListener?.let { ChatInboxEvents.attach(it) };refreshInbox?.invoke();startLive?.invoke() }
    fun close() { pause();refreshInbox=null;inboxListener=null;startLive=null;currentDialog?.dismiss();currentDialog=null }
    private fun dp(n:Int)=(n*activity.resources.displayMetrics.density).toInt()
    private fun label(s:String,size:Float=15f)=TextView(activity).apply { text=s;textSize=size;setPadding(dp(8),dp(8),dp(8),dp(8)) }
    private fun background(color:Int,radius:Int,border:Int?=null)=GradientDrawable().apply {
        setColor(color);cornerRadius=dp(radius).toFloat();if(border!=null) setStroke(dp(1),border)
    }
    private fun toast(s:String)=android.widget.Toast.makeText(activity,s,android.widget.Toast.LENGTH_LONG).show()

    fun customerInbox(offset:Int=0) = chatInbox("customer",offset)

    fun chatInbox(initialKind:String="customer", initialOffset:Int=0) {
        if(!valid()) return
        var tab=if(company.role=="관리자" && initialKind=="customer") "customer" else "team"
        var offset=initialOffset.coerceAtLeast(0);var generation=0;var closed=false
        var loadJob:Job?=null
        val handler=Handler(Looper.getMainLooper())
        val root=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(12),dp(16),dp(12));setBackgroundColor(Color.rgb(249,247,242)) }
        val tabs=LinearLayout(activity).apply { orientation=LinearLayout.HORIZONTAL }
        val customerTab=Button(activity).apply { text="고객 채팅";isAllCaps=false }
        val teamTab=Button(activity).apply { text="오늘 팀 채팅";isAllCaps=false }
        if(company.role=="관리자") { tabs.addView(customerTab,LinearLayout.LayoutParams(0,dp(52),1f));tabs.addView(teamTab,LinearLayout.LayoutParams(0,dp(52),1f));root.addView(tabs) }
        val scroll=ScrollView(activity)
        val rows=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(0,dp(8),0,dp(8)) }
        scroll.addView(rows);root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        val pages=LinearLayout(activity).apply { gravity=Gravity.CENTER;orientation=LinearLayout.HORIZONTAL };root.addView(pages)
        lateinit var dialog:AlertDialog
        lateinit var load:()->Unit
        val header=LinearLayout(activity).apply { gravity=Gravity.CENTER_VERTICAL;setBackgroundColor(Color.rgb(29,67,50));setPadding(dp(8),dp(4),dp(8),dp(4)) }
        header.addView(label("‹",30f).apply { gravity=Gravity.CENTER;setTextColor(Color.WHITE);contentDescription="채팅 목록 닫기";setOnClickListener { dialog.dismiss() } },LinearLayout.LayoutParams(dp(48),dp(52)))
        header.addView(label("채팅",19f).apply { setTextColor(Color.WHITE);setTypeface(null,android.graphics.Typeface.BOLD) },LinearLayout.LayoutParams(0,-2,1f))
        header.addView(label("↻",24f).apply { gravity=Gravity.CENTER;setTextColor(Color.WHITE);contentDescription="채팅 목록 새로고침";setOnClickListener { load() } },LinearLayout.LayoutParams(dp(48),dp(52)))
        dialog=AlertDialog.Builder(activity).setCustomTitle(header).setView(root).create()
        fun displayTime(raw:String):String = try {
            java.time.OffsetDateTime.parse(raw).atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul")).format(java.time.format.DateTimeFormatter.ofPattern("M월 d일 HH:mm"))
        } catch(_:Exception) { "" }
        fun card(title:String,preview:String,extra:String,onClick:()->Unit):LinearLayout {
            val box=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(14),dp(16),dp(14));background=background(Color.WHITE,16,Color.rgb(225,229,220));isClickable=true;isFocusable=true;setOnClickListener { if(valid()) onClick() } }
            box.addView(label(title,16f).apply { setPadding(0,0,0,dp(6));setTextColor(Color.rgb(29,67,50));setTypeface(null,android.graphics.Typeface.BOLD);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END })
            box.addView(label(preview,14f).apply { setPadding(0,0,0,dp(5));setTextColor(Color.rgb(66,76,69));maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END })
            box.addView(label(extra,12f).apply { setPadding(0,0,0,0);setTextColor(Color.rgb(92,115,99)) })
            return box
        }
        fun addCard(view:LinearLayout) { rows.addView(view,LinearLayout.LayoutParams(-1,-2).apply { setMargins(0,0,0,dp(10)) }) }
        fun open(kind:String,id:String,name:String,date:String) {
            val returnTab=tab;val returnOffset=offset
            dialog.dismiss();conversation(kind,id,name,date) { if(valid()) chatInbox(returnTab,returnOffset) }
        }
        fun pageButtons(more:Boolean,step:Int) {
            pages.removeAllViews()
            if(offset>0) pages.addView(Button(activity).apply { text="이전";setOnClickListener { offset=(offset-step).coerceAtLeast(0);load() } })
            if(more) pages.addView(Button(activity).apply { text="다음";setOnClickListener { offset+=step;load() } })
        }
        load=load@{
            if(closed || !dialog.isShowing || !valid()) return@load
            loadJob?.cancel();generation++;val request=generation;val currentTab=tab;val currentOffset=offset;val date=ScheduleDates.today()
            customerTab.isEnabled=currentTab!="customer";teamTab.isEnabled=currentTab!="team"
            rows.removeAllViews();pages.removeAllViews();rows.addView(label("대화를 불러오는 중입니다…"));scroll.scrollTo(0,0)
            loadJob=scope.launch {
                try {
                    if(currentTab=="customer") {
                        val data=auth.nativeChat(uid,company,"customers",offset=currentOffset)
                        if(closed || !dialog.isShowing || !valid() || generation!=request) return@launch
                        rows.removeAllViews();val list=data.getJSONArray("threads")
                        for(i in 0 until list.length()) {
                            val row=list.optJSONObject(i) ?: continue
                            val id=row.optString("id");if(!id.matches(Regex("^[0-9a-fA-F-]{36}$"))) continue
                            val name=row.optString("customer_name").takeUnless { it.isBlank() || it=="null" } ?: "고객"
                            val incoming=row.optString("last_customer_at").takeUnless { it=="null" }.orEmpty()
                            val read=row.optString("owner_read_at").takeUnless { it=="null" }.orEmpty()
                            val unread=incoming.isNotBlank() && (read.isBlank() || incoming>read)
                            val preview=row.optString("last_preview").takeUnless { it.isBlank() || it=="null" } ?: "아직 메시지가 없습니다."
                            val extra=listOfNotNull(if(unread) "● 새 메시지" else null,displayTime(row.optString("updated_at")).takeIf { it.isNotBlank() }).joinToString("  ·  ")
                            addCard(card(name,preview,extra) { open("customer",id,name,"") })
                        }
                        if(rows.childCount==0) rows.addView(label("고객 채팅이 없습니다."))
                        pageButtons(data.optBoolean("hasMore"),50)
                    } else {
                        val sites=DailyAssistant.briefing(auth.assistantSites(uid,company.id,dailyOnly=true),company.id,company.role=="관리자",date).sites
                        if(closed || !dialog.isShowing || !valid() || generation!=request || date!=ScheduleDates.today()) return@launch
                        rows.removeAllViews();val page=sites.drop(currentOffset).take(10)
                        if(page.isEmpty()) rows.addView(label("오늘 예정된 현장의 팀 채팅이 없습니다."))
                        pageButtons(currentOffset+10<sites.size,10)
                        val limiter=kotlinx.coroutines.sync.Semaphore(3)
                        kotlinx.coroutines.coroutineScope {
                            page.forEach { site ->
                                val placeholder=card(site.name,"대화를 확인하는 중입니다…",site.address) { open("team",site.id,site.name,date) }
                                addCard(placeholder)
                                launch {
                                    limiter.acquire()
                                    try {
                                        val data=auth.nativeChat(uid,company,"team_summary",target=site.id,date=date)
                                        if(closed || !dialog.isShowing || !valid() || generation!=request || date!=ScheduleDates.today()) return@launch
                                        check(data.has("lastMessage") && data.has("unreadCount")) { "팀 채팅 목록을 확인할 수 없습니다." }
                                        val preview=data.optString("lastMessage").takeUnless { it.isBlank() || it=="null" } ?: "아직 메시지가 없습니다."
                                        val count=if(data.isNull("unreadCount")) null else data.optInt("unreadCount")
                                        val badge=when {
                                            !data.optBoolean("readReady") -> "읽음 상태 확인 필요"
                                            data.optBoolean("unreadHasOlder") -> "최근 100개 중 안 읽은 메시지 ${count ?: 0}개 · 이전 대화 확인"
                                            count!=null && count>0 -> "● 안 읽은 메시지 ${count}개"
                                            else -> null
                                        }
                                        val extra=listOfNotNull(badge,displayTime(data.optString("lastAt")).takeIf { it.isNotBlank() },site.address.takeIf { it.isNotBlank() }).joinToString("  ·  ")
                                        (placeholder.getChildAt(1) as TextView).text=preview
                                        (placeholder.getChildAt(2) as TextView).text=extra
                                    } catch(e:CancellationException) { throw e }
                                      catch(_:Exception) { if(!closed && dialog.isShowing && valid() && generation==request) (placeholder.getChildAt(1) as TextView).text="대화를 확인하지 못했습니다. 눌러서 다시 확인해 주세요." }
                                    finally { limiter.release() }
                                }
                            }
                        }
                    }
                } catch(e:CancellationException) { throw e }
                  catch(_:Exception) { if(!closed && dialog.isShowing && valid() && generation==request) { rows.removeAllViews();rows.addView(label("채팅 목록을 불러오지 못했습니다."));rows.addView(Button(activity).apply { text="다시 시도";setOnClickListener { load() } }) } }
            }
        }
        customerTab.setOnClickListener { if(tab!="customer") { tab="customer";offset=0;load() } }
        teamTab.setOnClickListener { if(tab!="team") { tab="team";offset=0;load() } }
        val refresh=Runnable { load() }
        val listener:(ChatPushTarget)->Unit = { target ->
            if(!closed && valid() && target.user==uid && target.company==company.id && target.kind==tab && (tab!="team" || target.date==ScheduleDates.today())) {
                handler.removeCallbacks(refresh);handler.postDelayed(refresh,700)
            }
        }
        inboxListener=listener;refreshInbox=load;currentDialog=dialog
        dialog.setOnDismissListener { closed=true;loadJob?.cancel();handler.removeCallbacks(refresh);ChatInboxEvents.detach(listener);if(inboxListener===listener) { inboxListener=null;refreshInbox=null };if(currentDialog===dialog) currentDialog=null }
        dialog.setOnShowListener { dialog.window?.setLayout(-1,(activity.resources.displayMetrics.heightPixels*0.9).toInt());ChatInboxEvents.attach(listener);load() }
        dialog.show()
    }

    fun conversation(kind:String,target:String,title:String,date:String,onReturn:(()->Unit)?=null) {
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
        lateinit var dialog:AlertDialog
        lateinit var refresh:()->Unit
        val header=LinearLayout(activity).apply { gravity=Gravity.CENTER_VERTICAL;setPadding(dp(4),dp(6),dp(4),dp(6));setBackgroundColor(Color.rgb(29,67,50)) }
        val back=label("‹",30f).apply { gravity=Gravity.CENTER;setTextColor(Color.WHITE);contentDescription="채팅 닫기";setOnClickListener { dialog.dismiss();if(valid()) onReturn?.invoke() } }
        header.addView(back,LinearLayout.LayoutParams(dp(48),dp(52)))
        val heading=label(if(kind=="team") "$title · 팀 채팅" else "$title · 고객 채팅",18f).apply {
            setTextColor(Color.WHITE);setTypeface(null,android.graphics.Typeface.BOLD);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END
        }
        header.addView(heading,LinearLayout.LayoutParams(0,-2,1f))
        val reload=label("↻",24f).apply { gravity=Gravity.CENTER;setTextColor(Color.WHITE);contentDescription="대화 새로 확인";setOnClickListener { if(valid()) refresh() } }
        header.addView(reload,LinearLayout.LayoutParams(dp(48),dp(52)))
        dialog=AlertDialog.Builder(activity).setCustomTitle(header).setView(root).create()
        currentDialog=dialog
        val handler=Handler(Looper.getMainLooper());var closed=false;var loading=false;var pendingRefresh=false;var sending=false
        var lastVersion="";var firstLoad=true;var pendingText="";var pendingId="";var chatAllowed=true
        val customerReceipt=CustomerReadReceipt()
        var latestCustomerView:TextView?=null;var latestCustomerAt=""
        val teamViews=linkedMapOf<String,TextView>();val teamRead=mutableSetOf<String>();var teamReadReady=false
        val markVisible=object:Runnable { override fun run() {
            if(closed || !dialog.isShowing || !valid()) return
            if(kind=="customer") {
                val seen=customerReceipt.visible(latestCustomerAt,latestCustomerView?.getGlobalVisibleRect(android.graphics.Rect())==true) ?: return
                val rescan=this
                scope.launch {
                    try {
                        auth.nativeChat(uid,company,"customer",target,method="POST",body=JSONObject().put("action","read").put("seenAt",seen))
                        customerReceipt.completed(seen)
                        if(!closed && dialog.isShowing && valid()) { handler.removeCallbacks(rescan);handler.postDelayed(rescan,350) }
                    }
                    catch(e:CancellationException) { throw e }
                    catch(_:Exception) { customerReceipt.failed(seen) }
                }
                return
            }
            if(kind!="team" || !teamReadReady) return
            val ids=teamViews.filter { (id,view) -> id !in teamRead && view.getGlobalVisibleRect(android.graphics.Rect()) }.keys.take(100)
            if(ids.isEmpty()) return
            teamRead.addAll(ids)
            scope.launch {
                try { auth.nativeChat(uid,company,"team",target,date,"PATCH",JSONObject().put("messageIds",org.json.JSONArray(ids))) }
                catch(e:CancellationException) { throw e }
                catch(_:Exception) { teamRead.removeAll(ids.toSet());if(!closed && dialog.isShowing && valid()) status.text="읽음 상태를 저장하지 못했습니다. 다시 확인해 주세요." }
            }
        } }
        data class PhotoPreview(val container:FrameLayout,val image:ImageView,val hint:TextView,var url:String,var job:Job?=null,var failed:Boolean=false,var opening:Boolean=false)
        val previews=linkedMapOf<String,PhotoPreview>()
        val photoLimit=kotlinx.coroutines.sync.Semaphore(2)
        var expandedPhoto:AlertDialog?=null
        lateinit var scanPhotos:Runnable
        fun clearPreviews() {
            previews.values.forEach { it.job?.cancel();it.image.setImageDrawable(null) }
            previews.clear()
        }
        fun isVisible(view:android.view.View):Boolean = view.isAttachedToWindow && view.getGlobalVisibleRect(android.graphics.Rect())
        fun loadPreview(preview:PhotoPreview) {
            if(preview.job!=null || preview.failed || preview.image.drawable!=null || !isVisible(preview.container)) return
            val url=preview.url
            if(!ChatPhotoUrl.allowed(url,target)) { preview.failed=true;preview.hint.text="사진을 불러오지 못했습니다. 눌러서 다시 시도";return }
            preview.hint.text="사진을 불러오는 중…"
            preview.job=scope.launch {
                photoLimit.acquire()
                try {
                    val bitmap=withContext(Dispatchers.IO) { ChatPhotoLoader.load(url,target,512) }
                    if(closed || !dialog.isShowing || !valid() || !isVisible(preview.container) || previews.values.none { it===preview }) { bitmap?.recycle();return@launch }
                    if(bitmap==null) { preview.failed=true;preview.hint.text="사진을 불러오지 못했습니다. 눌러서 다시 시도" }
                    else { preview.image.setImageBitmap(bitmap);preview.hint.visibility=android.view.View.GONE }
                } finally { photoLimit.release();preview.job=null }
            }
        }
        scanPhotos=Runnable {
            if(!closed && dialog.isShowing && valid()) previews.values.forEach { preview ->
                if(isVisible(preview.container)) loadPreview(preview)
                else { preview.image.setImageDrawable(null);if(!preview.failed) { preview.hint.visibility=android.view.View.VISIBLE;preview.hint.text="사진을 불러오는 중…" } }
            }
        }
        scroll.setOnScrollChangeListener { _,_,_,_,_ ->
            handler.removeCallbacks(markVisible);handler.postDelayed(markVisible,350)
            handler.removeCallbacks(scanPhotos);handler.postDelayed(scanPhotos,150)
        }
        fun showPhoto(url:String) {
            if(!valid() || !ChatPhotoUrl.allowed(url,target)) { toast("사진을 확인할 수 없습니다.");return }
            val image=ImageView(activity).apply { adjustViewBounds=true;minimumHeight=dp(220);contentDescription="고객이 보낸 사진" }
            expandedPhoto?.dismiss()
            val photo=AlertDialog.Builder(activity).setTitle("사진을 불러오는 중…").setView(image).setPositiveButton("닫기",null).create()
            expandedPhoto=photo;photo.setOnDismissListener { if(expandedPhoto===photo) expandedPhoto=null };photo.show()
            scope.launch {
                val bitmap=withContext(Dispatchers.IO) { ChatPhotoLoader.load(url,target,1600) }
                if(!closed && dialog.isShowing && photo.isShowing && valid() && bitmap!=null) { photo.setTitle("채팅 사진");image.setImageBitmap(bitmap) } else bitmap?.recycle()
                if(bitmap==null && !closed && dialog.isShowing && photo.isShowing && valid()) { photo.setTitle("사진을 불러오지 못했습니다");toast("대화를 새로고침한 후 다시 시도해 주세요.") }
            }
        }
        refresh=refresh@{
            if(closed || !dialog.isShowing || !valid()) return@refresh
            if(loading) { pendingRefresh=true;return@refresh };loading=true
            scope.launch {
                try {
                    val data=auth.nativeChat(uid,company,kind,target,date)
                    if(closed || !dialog.isShowing || !valid()) return@launch
                    val list=data.getJSONArray("messages")
                    // Signed URLs rotate on each response; they are not message changes.
                    for(i in 0 until list.length()) list.optJSONObject(i)?.let { row ->
                        val id=row.optString("id");val url=row.optString("image_url").takeUnless { it=="null" }.orEmpty()
                        previews[id]?.url=url
                    }
                    val version=ChatPhotoMessages.version(list,data.optBoolean("hasOlder"))
                    if(version!=lastVersion) {
                        val nearBottom=firstLoad || scroll.scrollY+scroll.height>=messages.height-dp(80)
                        clearPreviews();messages.removeAllViews();latestCustomerView=null;teamViews.clear()
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
                                val id=m.optString("id");val url=m.optString("image_url").takeUnless { it=="null" }.orEmpty()
                                val image=ImageView(activity).apply { scaleType=ImageView.ScaleType.FIT_CENTER;contentDescription="채팅 사진 확대해서 보기" }
                                val hint=label("사진을 불러오는 중…",13f).apply { gravity=Gravity.CENTER;setTextColor(Color.rgb(89,111,96));setPadding(dp(8),dp(8),dp(8),dp(8)) }
                                val frame=FrameLayout(activity).apply {
                                    background=background(Color.rgb(239,242,235),14,Color.rgb(225,229,220));isClickable=true;isFocusable=true
                                    addView(image,FrameLayout.LayoutParams(-1,-1));addView(hint,FrameLayout.LayoutParams(-1,-1))
                                }
                                val preview=PhotoPreview(frame,image,hint,url);previews[id]=preview
                                frame.setOnClickListener {
                                    if(!valid() || closed) return@setOnClickListener
                                    if(preview.failed) {
                                        preview.failed=false;preview.hint.text="사진을 다시 확인하는 중…"
                                        scope.launch {
                                            try {
                                                val fresh=auth.nativeChat(uid,company,"customer",target)
                                                if(closed || !dialog.isShowing || !valid() || previews[id]!==preview) return@launch
                                                val items=fresh.getJSONArray("messages")
                                                preview.url=(0 until items.length()).mapNotNull { items.optJSONObject(it) }.find { it.optString("id")==id }?.optString("image_url").orEmpty()
                                                loadPreview(preview)
                                            } catch(e:CancellationException) { throw e }
                                              catch(_:Exception) { if(!closed && dialog.isShowing && valid() && previews[id]===preview) { preview.failed=true;preview.hint.text="사진을 불러오지 못했습니다. 눌러서 다시 시도" } }
                                        }
                                    } else if(preview.image.drawable!=null && !preview.opening) {
                                        preview.opening=true;preview.hint.visibility=android.view.View.VISIBLE;preview.hint.text="사진을 여는 중…"
                                        scope.launch {
                                            try {
                                                val fresh=auth.nativeChat(uid,company,"customer",target)
                                                if(closed || !dialog.isShowing || !valid() || previews[id]!==preview) return@launch
                                                val items=fresh.getJSONArray("messages")
                                                val url=(0 until items.length()).mapNotNull { items.optJSONObject(it) }.find { it.optString("id")==id }?.optString("image_url").orEmpty()
                                                preview.url=url;preview.hint.visibility=android.view.View.GONE
                                                showPhoto(url)
                                            } catch(e:CancellationException) { throw e }
                                              catch(_:Exception) { if(!closed && dialog.isShowing && valid() && previews[id]===preview) { preview.hint.visibility=android.view.View.GONE;toast("사진을 열지 못했습니다. 다시 시도해 주세요.") } }
                                            finally { preview.opening=false }
                                        }
                                    }
                                }
                                val photoRow=LinearLayout(activity).apply { gravity=if(mine) Gravity.END else Gravity.START;addView(frame,LinearLayout.LayoutParams(dp(220),dp(180))) }
                                messages.addView(photoRow,LinearLayout.LayoutParams(-1,-2).apply { setMargins(0,0,0,dp(10)) })
                            }
                        }
                        if(list.length()==0) messages.addView(label("아직 메시지가 없습니다."))
                        if(kind=="customer" && data.optBoolean("hasOlder")) messages.addView(label("이전 대화가 더 있습니다.",12f),0)
                        lastVersion=version;firstLoad=false
                        if(nearBottom) scroll.post { scroll.fullScroll(android.view.View.FOCUS_DOWN) }
                    }
                    if(kind=="customer") { handler.removeCallbacks(scanPhotos);scroll.post { handler.post(scanPhotos) } }
                    teamReadReady=kind=="team" && data.optBoolean("readReady")
                    if(kind=="customer" || teamReadReady) { handler.removeCallbacks(markVisible);handler.postDelayed(markVisible,500) }
                    chatAllowed=kind!="team" || data.optBoolean("chatReady");send.isEnabled=chatAllowed && !sending
                } catch(e:CancellationException) { throw e }
                  catch(e:Exception) { if(!closed && dialog.isShowing && valid()) { clearPreviews();messages.removeAllViews();teamViews.clear();latestCustomerView=null;lastVersion="";status.text=e.message ?: "대화를 불러오지 못했습니다. 다시 확인해 주세요." } }
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
            refresh()
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
        dialog.setOnDismissListener { closed=true;expandedPhoto?.dismiss();expandedPhoto=null;pause();startLive=null;handler.removeCallbacks(markVisible);handler.removeCallbacks(scanPhotos);clearPreviews();if(currentDialog===dialog) currentDialog=null }
        dialog.setOnCancelListener { handler.post { if(valid()) onReturn?.invoke() } }
        dialog.setOnShowListener {
            dialog.window?.setLayout(-1,(activity.resources.displayMetrics.heightPixels*0.9).toInt())
            dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            resume()
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

/** Read only a bounded, trusted chat photo and decode to a bounded size. */
internal object ChatPhotoLoader {
    fun sampleSize(width:Int,height:Int,maxSide:Int):Int? {
        if(width<=0 || height<=0 || width>16000 || height>16000 || maxSide<=0) return null
        var sample=1
        while(width/sample>maxSide || height/sample>maxSide) sample*=2
        return sample
    }
    fun load(url:String,thread:String,maxSide:Int):android.graphics.Bitmap? {
        if(!ChatPhotoUrl.allowed(url,thread)) return null
        return try {
            val connection=SecureTransport.open(url)
            try {
                if(connection.responseCode!=200) null else {
                    val bytes=connection.inputStream.use { SecureTransport.readBounded(it,4*1024*1024) }
                    val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true }
                    BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                    val sample=sampleSize(bounds.outWidth,bounds.outHeight,maxSide)
                    if(sample==null) null else BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().apply { inSampleSize=sample })
                }
            } finally { connection.disconnect() }
        } catch(_:Exception) { null }
    }
}

internal object ChatPhotoMessages {
    fun version(messages:org.json.JSONArray,hasOlder:Boolean):String {
        val stable=org.json.JSONArray()
        for(i in 0 until messages.length()) messages.optJSONObject(i)?.let { row ->
            val copy=JSONObject(row.toString());copy.remove("image_url");stable.put(copy)
        }
        return stable.toString()+":"+hasOlder
    }
}
