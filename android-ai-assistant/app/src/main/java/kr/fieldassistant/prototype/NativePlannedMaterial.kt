package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.text.InputFilter
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.Toast
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

/** Administrator-only planned-material creation through the existing idempotent API. */
internal class NativePlannedMaterial(
    private val activity:Activity,private val auth:AccountAuth,private val scope:CoroutineScope,
    private val uid:String,private val company:CompanyAccess,private val siteId:String,private val siteName:String,
    private val valid:()->Boolean,
) {
    private val prefs=activity.getSharedPreferences("assistant_user_"+uid,Context.MODE_PRIVATE)
    private val key="native_planned_material_pending"
    private var busy=false
    private fun toast(s:String)=Toast.makeText(activity,s,Toast.LENGTH_LONG).show()
    private fun pending():JSONObject?=try { prefs.getString(key,null)?.let { JSONObject(it) } } catch(_:Exception) { null }
    private fun clean(row:JSONObject,key:String)=row.optString(key).takeUnless { it.isBlank() || it=="null" }.orEmpty()

    fun open() {
        if(!valid() || company.role!="관리자" || busy) return
        val old=pending()
        if(old!=null) { showPending(old);return }
        loadList()
    }

    private fun loadList() {
        if(!valid() || busy) return
        busy=true
        scope.launch {
            try {
                val data=auth.listAssistantPlannedMaterials(uid,company.id,siteId)
                if(!valid()) return@launch
                val list=data.getJSONArray("materials")
                val rows=(0 until list.length()).mapNotNull { list.optJSONObject(it) }
                val shown=rows.take(100).joinToString("\n") { row ->
                    val label=listOf(clean(row,"brand"),clean(row,"product_code").ifBlank { clean(row,"product_name") }).filter { it.isNotBlank() }.joinToString(" ")
                    val type=when(clean(row,"price_type")) { "fire"->"방염";"non_fire"->"비방염";else->"구분 확인" }
                    "• ${label.ifBlank { "자재" }} · $type"
                }
                val info=if(rows.isEmpty()) "등록된 자재가 없습니다." else "등록된 자재 ${rows.size}개\n$shown"+(if(rows.size>100) "\n외 ${rows.size-100}개" else "")
                val dialog=AlertDialog.Builder(activity).setTitle("$siteName · 현장 자재")
                    .setMessage(info+"\n\n등록 후 시공자가 자재 반출·반납을 확인할 수 있습니다.")
                    .setNegativeButton("닫기",null)
                if(data.optBoolean("canWrite",false)) dialog.setPositiveButton("자재 추가") { _,_ -> if(valid()) edit() }
                dialog.show()
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) toast(e.message ?: "자재 목록을 확인하지 못했습니다.") }
            finally { busy=false }
        }
    }

    private fun edit() {
        if(!valid() || company.role!="관리자") return
        val f=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(30,8,30,8) }
        fun field(hintText:String,max:Int)=EditText(activity).apply { hint=hintText;setSingleLine();filters=arrayOf(InputFilter.LengthFilter(max));f.addView(this) }
        val brand=field("제조사 (예: 현대)",100);val code=field("제품번호 (예: S115)",100);val name=field("제품명 (선택)",200)
        val types=listOf("방염 구분을 선택하세요","비방염","방염")
        val type=Spinner(activity).apply { adapter=ArrayAdapter(activity,android.R.layout.simple_spinner_dropdown_item,types);f.addView(this) }
        val dialog=AlertDialog.Builder(activity).setTitle("$siteName · 자재 추가")
            .setMessage("현장에 사용할 자재를 등록합니다. 재고 반출과 보고서 제출은 별도로 진행됩니다.")
            .setView(f).setNegativeButton("취소",null).setPositiveButton("등록 내용 확인",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid() || busy) return@setOnClickListener
            val b=brand.text.toString().trim();val c=code.text.toString().trim();val n=name.text.toString().trim()
            val selected=type.selectedItemPosition
            if(b.isBlank() || (c.isBlank() && n.isBlank()) || selected !in 1..2) { toast("제조사, 제품번호 또는 이름, 방염 구분을 확인해 주세요.");return@setOnClickListener }
            val body=JSONObject().put("siteId",siteId).put("id",UUID.randomUUID().toString()).put("brand",b)
                .put("product_code",c).put("product_name",n).put("price_type",if(selected==1) "non_fire" else "fire").put("unit","m")
            val description="$siteName\n$b ${c.ifBlank { n }} · ${types[selected]}\n\n현장 자재 목록에 등록할까요?"
            AlertDialog.Builder(activity).setTitle("현장 자재 등록 확인").setMessage(description).setNegativeButton("돌아가기",null)
                .setPositiveButton("등록") { _,_ ->
                    if(!valid() || busy) return@setPositiveButton
                    if(pending()!=null) { toast("이전 자재 등록 결과를 먼저 확인해 주세요.");return@setPositiveButton }
                    val record=JSONObject().put("user",uid).put("company",company.id).put("siteId",siteId).put("summary",description).put("body",body)
                    if(!prefs.edit().putString(key,record.toString()).commit()) { toast("등록 요청을 보관하지 못했습니다.");return@setPositiveButton }
                    dialog.dismiss();send(record)
                }.show()
        } };dialog.show()
    }

    private fun showPending(record:JSONObject) {
        if(record.optString("user")!=uid || record.optString("company")!=company.id || record.optString("siteId")!=siteId) {
            toast("이전 자재 등록을 시작한 업체와 현장에서 결과를 먼저 확인해 주세요.");return
        }
        AlertDialog.Builder(activity).setTitle("이전 자재 등록 확인")
            .setMessage(record.optString("summary")+"\n\n결과를 확인하지 못한 요청입니다. 같은 요청으로 다시 확인할 수 있습니다.")
            .setNegativeButton("닫기",null).setNeutralButton("등록 목록 확인") { _,_ -> inspectPending(record) }
            .setPositiveButton("결과 다시 확인") { _,_ -> send(record) }.show()
    }

    private fun inspectPending(record:JSONObject) {
        if(!valid() || busy) return
        val body=record.optJSONObject("body") ?: return
        busy=true
        scope.launch {
            try {
                val data=auth.listAssistantPlannedMaterials(uid,company.id,siteId)
                if(!valid()) return@launch
                val rows=data.getJSONArray("materials")
                val matches=(0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.filter { row ->
                    clean(row,"brand").equals(body.optString("brand"),true) &&
                        (clean(row,"product_code").equals(body.optString("product_code"),true) && body.optString("product_code").isNotBlank() ||
                         clean(row,"product_name").equals(body.optString("product_name"),true) && body.optString("product_name").isNotBlank())
                }
                val message=if(matches.isEmpty()) "같은 제조사와 제품번호·이름의 자재를 찾지 못했습니다." else matches.joinToString("\n") { row ->
                    clean(row,"brand")+" "+clean(row,"product_code").ifBlank { clean(row,"product_name") }+" · "+when(clean(row,"price_type")) { "fire"->"방염";"non_fire"->"비방염";else->"구분 확인" }
                }
                AlertDialog.Builder(activity).setTitle("현재 등록된 자재 확인").setMessage(message+"\n\n이전 요청:\n"+record.optString("summary")+
                    "\n\n목록을 확인한 뒤 요청을 닫으면 다시 보낼 수 없습니다. 확실하지 않으면 요청을 유지해 주세요.")
                    .setNegativeButton("요청 유지",null).setPositiveButton("확인 후 요청 닫기") { _,_ ->
                        if(valid() && pending()?.optJSONObject("body")?.optString("id")==body.optString("id") && prefs.edit().remove(key).commit()) open()
                    }.show()
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) toast(e.message ?: "자재 목록을 확인하지 못했습니다.") }
            finally { busy=false }
        }
    }

    private fun send(record:JSONObject) {
        if(!valid() || busy || company.role!="관리자" || record.optString("user")!=uid || record.optString("company")!=company.id || record.optString("siteId")!=siteId) return
        val body=record.optJSONObject("body") ?: return
        busy=true
        scope.launch {
            var refresh=false
            try {
                val result=auth.addAssistantPlannedMaterial(uid,company.id,siteId,body)
                if(!valid()) return@launch
                check(pending()?.optJSONObject("body")?.optString("id")==body.optString("id") && prefs.edit().remove(key).commit()) { "등록 결과는 받았지만 휴대전화 상태를 정리하지 못했습니다." }
                toast(if(result.optBoolean("alreadyExists")) "이미 등록된 자재입니다." else if(result.optBoolean("missingPrice")) "자재를 등록했습니다. 원가 단가는 관리자가 확인해 주세요." else "현장 자재를 등록했습니다.")
                refresh=true
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) AlertDialog.Builder(activity).setTitle("자재 등록 결과 확인 필요")
                  .setMessage((e.message ?: "등록 결과를 확인하지 못했습니다.")+"\n\n중복을 막기 위해 이전 요청을 보관했습니다. 목록 또는 저장 결과를 확인해 주세요.")
                  .setPositiveButton("확인",null).show() }
            finally { busy=false;if(refresh && valid()) loadList() }
        }
    }
}
