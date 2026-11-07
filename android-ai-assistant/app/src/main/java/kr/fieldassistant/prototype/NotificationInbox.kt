package kr.fieldassistant.prototype

import android.app.AlertDialog
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Private, account-scoped history. Destinations contain only allowlisted MainActivity extras. */
internal object NotificationInbox {
    private const val OWNER="kr.fieldassistant.notification_owner"
    private const val ENTRY="inbox_entry"
    private const val USER="inbox_user"
    private val destinationKeys=setOf("assistant_record","assistant_user","schedule_user","schedule_date",
        "chat_push_kind","chat_push_recipient_id","chat_push_company_id","chat_push_target_id","chat_push_message_id","chat_push_date",
        "site_notice_user","site_notice_company","site_notice_site","site_notice_id","site_notice_action")
    fun owner(user:String)=Bundle().apply { putString(OWNER,user) }
    private fun prefs(c:Context,u:String)=c.getSharedPreferences("notification_history_$u",Context.MODE_PRIVATE)
    @Volatile var onChanged:((String)->Unit)?=null
    private fun rows(c:Context,u:String):List<JSONObject> {
        val p=prefs(c,u);val raw=p.getString("entries","[]") ?: "[]"
        val items=NotificationHistory.retained(raw,System.currentTimeMillis())
        val retained=JSONArray(items).toString()
        if(raw!=retained) p.edit().putString("entries",retained).apply()
        return items
    }
    private fun save(c:Context,u:String,items:List<JSONObject>) {
        prefs(c,u).edit().putString("entries",JSONArray(items).toString()).apply()
        android.os.Handler(android.os.Looper.getMainLooper()).post { onChanged?.invoke(u) }
    }
    @Synchronized fun record(c:Context,u:String,key:String,kind:String,title:String,body:String,intent:Intent,tag:String?,code:Int) {
        if(u.isBlank() || ChatPushRegistration.activeUser(c)!=u) return
        val old=rows(c,u)
        // Redelivered push messages and repeated call scans must not reset read state.
        if(old.none { it.optString("key")==key }) {
            val route=JSONObject()
            destinationKeys.forEach { k -> intent.getStringExtra(k)?.let { route.put(k,it) } }
            val entry=JSONObject().put("key",key).put("kind",kind).put("title",title.take(120)).put("body",body.take(500))
                .put("time",System.currentTimeMillis()).put("read",false).put("route",route).put("code",code)
            if(tag!=null) entry.put("tag",tag)
            save(c,u,NotificationHistory.append(old,entry))
        }
        intent.putExtra(ENTRY,key).putExtra(USER,u)
    }
    @Synchronized fun unread(c:Context,u:String):Int = if(u.isBlank()) 0 else rows(c,u).count { !it.optBoolean("read") }
    @Synchronized fun markRead(c:Context,u:String,key:String?=null) {
        if(ChatPushRegistration.activeUser(c)!=u) return
        val items=rows(c,u)
        items.filter { key==null || it.optString("key")==key }.forEach {
            it.put("read",true)
            c.getSystemService(NotificationManager::class.java)?.cancel(it.optString("tag").takeIf(String::isNotBlank),it.optInt("code"))
        }
        save(c,u,items)
    }
    fun opened(c:Context,intent:Intent?) {
        val u=intent?.getStringExtra(USER) ?: return
        val key=intent.getStringExtra(ENTRY) ?: return
        markRead(c,u,key);intent.removeExtra(USER);intent.removeExtra(ENTRY)
    }
    fun show(context:Context,user:String,onChanged:()->Unit={}) {
        if(ChatPushRegistration.activeUser(context)!=user) return
        val items=synchronized(this) { rows(context,user) }
        val format=SimpleDateFormat("MM/dd HH:mm",Locale.KOREA)
        val labels=items.map {
            val kind=when(it.optString("kind")) { "call"->"상담 전화";"customer"->"고객 채팅";"team"->"팀 채팅";"schedule"->"현장 일정";else->"현장 알림" }
            val action=when(it.optString("kind")) { "call"->"상담 등록 확인";"customer","team"->"대화 열기";"schedule"->"일정 확인";else->"현장 업무 확인" }
            "${if(it.optBoolean("read")) "읽음" else "● 안 읽음"} · $kind\n${it.optString("title")}\n${it.optString("body")}\n${format.format(Date(it.optLong("time")))} · $action →"
        }.toTypedArray()
        val dialog=AlertDialog.Builder(context).setTitle("알림함 · 안 읽음 ${unread(context,user)}")
            .setNegativeButton("닫기",null)
        if(items.isEmpty()) dialog.setMessage("새로 받은 알림은 이 휴대폰에 30일간, 최대 200개 보관됩니다. 업데이트 전에 지운 알림은 복원되지 않습니다.")
        else {
            dialog.setItems(labels) { _,i ->
                if(ChatPushRegistration.activeUser(context)!=user) return@setItems
                val item=items[i];val route=item.optJSONObject("route") ?: JSONObject()
                if(route.length()==0) {
                    markRead(context,user,item.optString("key"));onChanged()
                    AlertDialog.Builder(context).setTitle(item.optString("title")).setMessage(item.optString("body")).setPositiveButton("확인",null).show()
                } else {
                    val intent=Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    destinationKeys.forEach { k -> if(route.has(k)) intent.putExtra(k,route.getString(k)) }
                    intent.putExtra(USER,user).putExtra(ENTRY,item.optString("key"))
                    try { context.startActivity(intent);markRead(context,user,item.optString("key"));onChanged() }
                    catch(_:Exception) { Toast.makeText(context,"알림을 열지 못했습니다. 다시 시도해 주세요.",Toast.LENGTH_LONG).show() }
                }
            }
            dialog.setNeutralButton("모두 읽음") { _,_ -> markRead(context,user);onChanged();show(context,user,onChanged) }
        }
        dialog.show()
    }
}
