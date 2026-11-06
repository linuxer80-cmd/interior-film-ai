package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.text.InputFilter
import android.text.InputType
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

/** Owner-scoped dealer and price setup, with recoverable idempotent requests. */
internal class NativeDealerSetup(
    private val activity:Activity,private val auth:AccountAuth,private val scope:CoroutineScope,
    private val uid:String,private val company:CompanyAccess,private val valid:()->Boolean,
    private val currentData:()->JSONObject,private val onSaved:(JSONObject,Int)->Unit,
) {
    private val prefs=activity.getSharedPreferences("assistant_user_"+uid,Context.MODE_PRIVATE)
    private val key="dealer_setup_pending_"+company.id
    private var busy=false
    private fun field(row:JSONObject,k:String)=row.optString(k).takeUnless { it.isBlank() || it=="null" }.orEmpty()
    private fun say(text:String) { if(valid()) AlertDialog.Builder(activity).setMessage(text).setPositiveButton("확인",null).show() }
    private fun pending():JSONObject?=try { prefs.getString(key,null)?.let { JSONObject(it) } } catch(_:Exception) { null }
    private fun form()=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(30,8,30,8) }
    private fun field(form:LinearLayout,hintText:String,initial:String,max:Int,numeric:Boolean=false)=EditText(activity).apply {
        hint=hintText;setSingleLine();filters=arrayOf(InputFilter.LengthFilter(max));if(numeric) inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        setText(initial);form.addView(this)
    }
    fun hasPending()=prefs.contains(key)
    fun reviewPending() {
        if(!valid() || busy) return
        val record=pending() ?: run { say("이전 등록 요청을 확인할 수 없습니다. 관리자에게 확인해 주세요.");return }
        if(record.optString("uid")!=uid || record.optString("company")!=company.id) { say("등록을 시작한 계정과 업체를 확인해 주세요.");return }
        AlertDialog.Builder(activity).setTitle("이전 대리점·공급가 저장 확인")
            .setMessage(record.optString("summary")+"\n\n저장 결과가 불확실합니다. 같은 요청을 다시 확인하거나 현재 목록을 확인해 주세요.")
            .setNegativeButton("닫기",null).setNeutralButton("현재 목록 확인") { _,_ -> inspect(record) }
            .setPositiveButton("결과 다시 확인") { _,_ -> run(record) }.show()
    }
    fun dealer(existing:JSONObject?,suggested:String,rowIndex:Int) {
        if(!valid() || busy) return
        if(hasPending()) { reviewPending();return }
        val f=form();val name=field(f,"대리점 이름",existing?.let { field(it,"name") } ?: suggested,100)
        val phone=field(f,"연락처 (선택)",existing?.let { field(it,"phone") }.orEmpty(),100)
        val brands=field(f,"취급 브랜드 (선택)",existing?.let { field(it,"brands") }.orEmpty(),200)
        val dialog=AlertDialog.Builder(activity).setTitle(if(existing==null) "대리점 등록" else "대리점 정보 수정")
            .setView(f).setNegativeButton("취소",null).setPositiveButton("내용 확인",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid()) return@setOnClickListener
            val n=name.text.toString().trim();if(n.isBlank()) { say("대리점 이름을 입력해 주세요.");return@setOnClickListener }
            val rows=currentData().getJSONArray("dealers");val keyName=DealerSetupInput.normalizedName(n);val editingId=existing?.let { field(it,"id") }.orEmpty()
            val duplicate=(0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.any { field(it,"id")!=editingId && DealerSetupInput.normalizedName(field(it,"name"))==keyName }
            if(duplicate) { say("이름이 같은 대리점이 이미 있습니다. 목록에서 선택해 주세요.");return@setOnClickListener }
            if(existing!=null && (!existing.has("revision") || existing.isNull("revision"))) { say("대리점 정보를 다시 확인해 주세요.");return@setOnClickListener }
            val body=JSONObject().put("action","dealer").put("requestId",UUID.randomUUID().toString()).put("name",n)
                .put("phone",phone.text.toString().trim()).put("brands",brands.text.toString().trim())
            if(existing!=null) body.put("dealerId",editingId).put("revision",existing.getInt("revision"))
            val summary="대리점: $n\n연락처: ${body.optString("phone").ifBlank { "미입력" }}\n취급 브랜드: ${body.optString("brands").ifBlank { "미입력" }}"
            confirm(summary,body,rowIndex) { dialog.dismiss() }
        } };dialog.show()
    }
    fun product(dealer:JSONObject,brandHint:String,codeHint:String,rowIndex:Int) {
        if(!valid() || busy) return
        if(hasPending()) { reviewPending();return }
        val f=form();val brand=field(f,"제조사 (예: 현대)",brandHint,100);val code=field(f,"제품번호 (예: S115)",codeHint,80)
        val product=field(f,"제품명 (선택)","",200);val amount=field(f,"1m당 공급가 (원)","",16,true)
        val types=listOf("방염 구분을 선택하세요","비방염","방염")
        val type=Spinner(activity).apply { adapter=ArrayAdapter(activity,android.R.layout.simple_spinner_dropdown_item,types);f.addView(this) }
        val dialog=AlertDialog.Builder(activity).setTitle("${field(dealer,"name")} · 제품과 공급가 등록")
            .setMessage("기존 제품이 있으면 재사용하며, 이미 등록된 공급가는 덮어쓰지 않습니다.")
            .setView(ScrollView(activity).apply { addView(f) }).setNegativeButton("취소",null).setPositiveButton("내용 확인",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid()) return@setOnClickListener
            val b=brand.text.toString().trim();val c=code.text.toString().trim();val p=DealerSetupInput.price(amount.text.toString());val k=DealerSetupInput.type(type.selectedItemPosition)
            if(b.isBlank() || c.isBlank() || p==null || k==null) { say("제조사, 제품번호, 방염 구분과 1m당 공급가를 확인해 주세요.");return@setOnClickListener }
            val body=JSONObject().put("action","register_product").put("requestId",UUID.randomUUID().toString()).put("dealerId",field(dealer,"id"))
                .put("brand",b).put("productCode",c).put("productName",product.text.toString().trim()).put("priceType",k).put("unitPrice",p.toPlainString())
            val summary="${field(dealer,"name")} · $b $c · ${types[type.selectedItemPosition]}\n1m당 공급가: ${p.toPlainString()}원\n제품명: ${body.optString("productName").ifBlank { "미입력" }}"
            confirm(summary,body,rowIndex) { dialog.dismiss() }
        } };dialog.show()
    }
    fun price(dealer:JSONObject,price:JSONObject,rowIndex:Int) {
        if(!valid() || busy) return
        if(hasPending()) { reviewPending();return }
        if(!price.has("revision") || price.isNull("revision") || field(price,"price_type") !in listOf("fire","non_fire")) { say("공급가 정보를 다시 확인해 주세요.");return }
        val input=EditText(activity).apply { hint="1m당 공급가 (원)";inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL;filters=arrayOf(InputFilter.LengthFilter(16));setText(field(price,"unit_price"));setSingleLine() }
        val label="${field(dealer,"name")} · ${field(price,"brand")} ${field(price,"product_code")} · ${if(field(price,"price_type")=="fire") "방염" else "비방염"}"
        val dialog=AlertDialog.Builder(activity).setTitle("공급가 수정").setMessage("$label\n현재 ${field(price,"unit_price")}원/m\n\n변경 후 입고하는 물량에 적용됩니다.")
            .setView(input).setNegativeButton("취소",null).setPositiveButton("내용 확인",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid()) return@setOnClickListener
            val amount=DealerSetupInput.price(input.text.toString()) ?: run { say("공급가는 0~10,000,000원으로 입력해 주세요.");return@setOnClickListener }
            val body=JSONObject().put("action","price").put("requestId",UUID.randomUUID().toString()).put("dealerId",field(dealer,"id"))
                .put("productId",field(price,"product_id")).put("priceType",field(price,"price_type")).put("unitPrice",amount.toPlainString()).put("priceRevision",price.getInt("revision"))
            confirm("$label\n공급가 ${field(price,"unit_price")}원 → ${amount.toPlainString()}원/m",body,rowIndex) { dialog.dismiss() }
        } };dialog.show()
    }
    private fun confirm(summary:String,body:JSONObject,rowIndex:Int,onAccepted:()->Unit) {
        AlertDialog.Builder(activity).setTitle("저장 내용 확인").setMessage(summary+"\n\n저장할까요?")
            .setNegativeButton("돌아가기",null).setPositiveButton("저장") { _,_ ->
                if(!valid() || busy) return@setPositiveButton
                if(hasPending()) { reviewPending();return@setPositiveButton }
                val record=JSONObject().put("uid",uid).put("company",company.id).put("rowIndex",rowIndex).put("summary",summary).put("body",body)
                if(!prefs.edit().putString(key,record.toString()).commit()) { say("저장 요청을 보관하지 못했습니다.");return@setPositiveButton }
                onAccepted();run(record)
            }.show()
    }
    private fun run(record:JSONObject) {
        if(!valid() || busy || record.optString("uid")!=uid || record.optString("company")!=company.id) return
        val body=record.optJSONObject("body") ?: run { say("저장 요청을 확인하지 못했습니다.");return }
        if(pending()?.optJSONObject("body")?.optString("requestId")!=body.optString("requestId")) { say("저장 요청이 변경되었습니다. 다시 확인해 주세요.");return }
        busy=true
        scope.launch {
            var result:JSONObject?=null
            try {
                val data=auth.dealerInventory(uid,company.id,body)
                if(!valid()) return@launch
                check(pending()?.optJSONObject("body")?.optString("requestId")==body.optString("requestId") && prefs.edit().remove(key).commit()) { "저장 결과는 받았지만 휴대전화 상태를 정리하지 못했습니다." }
                result=data
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) AlertDialog.Builder(activity).setTitle("저장 결과 확인 필요")
                  .setMessage((e.message ?: "저장 결과를 확인하지 못했습니다.")+"\n\n이전 요청을 보관했습니다. 결과를 다시 확인하거나 현재 목록을 확인해 주세요.")
                  .setPositiveButton("확인",null).show() }
            finally { busy=false;result?.let { if(valid()) onSaved(it,record.optInt("rowIndex",-1)) } }
        }
    }
    private fun inspect(record:JSONObject) {
        if(!valid() || busy) return
        busy=true
        scope.launch {
            try {
                val data=auth.dealerInventory(uid,company.id)
                if(!valid()) return@launch
                val body=record.optJSONObject("body") ?: return@launch
                val dealers=data.getJSONArray("dealers");val prices=data.getJSONArray("prices")
                val names=(0 until dealers.length()).mapNotNull { dealers.optJSONObject(it) }.take(100).joinToString("\n") { field(it,"name") }
                val dealerId=body.optString("dealerId")
                val lines=(0 until prices.length()).mapNotNull { prices.optJSONObject(it) }.filter { dealerId.isNotBlank() && field(it,"dealer_id")==dealerId }
                    .take(100).joinToString("\n") { "${field(it,"brand")} ${field(it,"product_code")} · ${if(field(it,"price_type")=="fire") "방염" else if(field(it,"price_type")=="non_fire") "비방염" else "구분 미지정"} · ${field(it,"unit_price")}원/m" }
                AlertDialog.Builder(activity).setTitle("현재 대리점·공급가 확인")
                    .setMessage("대리점 목록:\n${names.ifBlank { "없음" }}\n\n해당 대리점 공급가 (최대 100건):\n${lines.ifBlank { "없음 또는 해당 없음" }}\n\n이전 요청:\n${record.optString("summary")}\n\n목록을 확인해도 저장 여부가 불확실하면 요청을 유지해 주세요.")
                    .setNegativeButton("요청 유지",null).setPositiveButton("확인 후 요청 닫기") { _,_ ->
                        if(valid() && pending()?.optJSONObject("body")?.optString("requestId")==body.optString("requestId") && prefs.edit().remove(key).commit()) onSaved(data,record.optInt("rowIndex",-1))
                    }.show()
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) say(e.message ?: "대리점 목록을 확인하지 못했습니다.") }
            finally { busy=false }
        }
    }
}
