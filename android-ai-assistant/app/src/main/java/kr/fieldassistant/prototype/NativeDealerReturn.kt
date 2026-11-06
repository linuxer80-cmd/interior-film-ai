package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.text.InputFilter
import android.text.InputType
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.math.BigDecimal
import java.util.UUID

/** One explicitly chosen stock roll per transaction; no automatic allocation or credit. */
internal class NativeDealerReturn(
    private val activity:Activity,private val auth:AccountAuth,private val scope:CoroutineScope,
    private val uid:String,private val company:CompanyAccess,private val valid:()->Boolean,
    private val getData:()->JSONObject,private val onData:(JSONObject)->Unit,private val onResume:()->Unit,
) {
    private val prefs=activity.getSharedPreferences("assistant_user_"+uid,Context.MODE_PRIVATE)
    private val draftKey="dealer_receipt_draft_"+company.id
    private val pendingKey="dealer_return_pending_"+company.id
    private var busy=false
    private fun field(row:JSONObject,key:String)=row.optString(key).takeUnless { it.isBlank() || it=="null" }.orEmpty()
    private fun pending():JSONObject?=try { prefs.getString(pendingKey,null)?.let(::JSONObject) } catch(_:Exception) { null }
    private fun draft():JSONObject?=try { prefs.getString(draftKey,null)?.let(::JSONObject) } catch(_:Exception) { null }
    private fun say(s:String) { if(valid()) AlertDialog.Builder(activity).setMessage(s).setPositiveButton("확인",null).show() }
    fun hasPending()=prefs.contains(pendingKey)
    fun open(record:JSONObject,index:Int) {
        if(!valid() || busy) return
        if(hasPending()) { reviewPending();return }
        val row=record.getJSONObject("analysis").getJSONArray("rows").getJSONObject(index)
        if(row.optBoolean("_done")) { say("이미 반납이 확인된 품목입니다.");return }
        val form=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(30,8,30,8) }
        fun input(hintText:String,value:String,numeric:Boolean=false)=EditText(activity).apply {
            hint=hintText;setSingleLine();filters=arrayOf(InputFilter.LengthFilter(if(numeric) 16 else 100));if(numeric) inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setText(value);form.addView(this)
        }
        val partial=row.has("_returnRemaining")
        val brand=input("제조사",field(row,"_returnBrand").ifBlank { field(row,"brand") });val code=input("제품번호",field(row,"_returnCode").ifBlank { field(row,"code") })
        if(partial) { brand.isEnabled=false;code.isEnabled=false }
        val remaining=field(row,"_returnRemaining").ifBlank { field(row,"totalM") }
        val total=input("남은 반납량 (m)",remaining,true);if(row.has("_returnRemaining")) total.isEnabled=false
        val rollCount=input("영수증의 롤 수 (선택)",if(row.has("_returnExpectedRolls")) field(row,"_returnExpectedRolls") else field(row,"rollCount"),true)
        val choices=listOf("방염 구분을 선택하세요","비방염","방염")
        val kind=Spinner(activity).apply { adapter=ArrayAdapter(activity,android.R.layout.simple_spinner_dropdown_item,choices);form.addView(this) }
        if(partial) { kind.setSelection(if(field(row,"_returnType")=="fire") 2 else 1);kind.isEnabled=false }
        val dialog=AlertDialog.Builder(activity).setTitle("반납할 제품 확인").setMessage("영수증의 제조사·제품번호·방염 구분과 남은 총 반납량을 확인합니다. 여러 롤은 한 롤씩 선택합니다.")
            .setView(form).setNegativeButton("취소",null).setPositiveButton("대리점 선택",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid()) return@setOnClickListener
            val b=brand.text.toString().trim();val c=code.text.toString().trim();val k=DealerSetupInput.type(kind.selectedItemPosition)
            val metres=total.text.toString().trim().toBigDecimalOrNull()
            val countText=rollCount.text.toString().trim();val count=if(countText.isBlank()) null else countText.toIntOrNull()
            if(b.isBlank() || c.isBlank() || k==null || metres==null || metres<=BigDecimal.ZERO || metres>BigDecimal(1000000) || (countText.isNotBlank() && (count==null || count !in 1..50)) || (count!=null && count<=row.optInt("_returnCount",0))) { say("제조사, 제품번호, 방염 구분과 반납량·롤 수를 확인해 주세요.");return@setOnClickListener }
            val existingType=field(row,"priceType")
            if(existingType in listOf("fire","non_fire") && existingType!=k) { say("영수증에서 읽은 방염 구분과 다릅니다. 영수증을 다시 확인해 주세요.");return@setOnClickListener }
            dialog.dismiss();chooseDealer(index,b,c,k,metres,count,field(row,"_returnDealer"))
        } };dialog.show()
    }
    private fun chooseDealer(index:Int,brand:String,code:String,kind:String,total:BigDecimal,expectedCount:Int?,fixedDealer:String) {
        if(!valid()) return
        val arr=getData().getJSONArray("dealers");val dealers=(0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.filter { fixedDealer.isBlank() || field(it,"id")==fixedDealer }
        if(dealers.isEmpty()) { say("등록된 대리점이 없습니다. 반납할 대리점을 먼저 확인해 주세요.");return }
        AlertDialog.Builder(activity).setTitle("반납할 대리점 선택").setItems(dealers.map { field(it,"name") }.toTypedArray()) { _,i ->
            chooseRoll(index,dealers[i],brand,code,kind,total,expectedCount)
        }.setNegativeButton("취소",null).show()
    }
    private fun chooseRoll(index:Int,dealer:JSONObject,brand:String,code:String,kind:String,total:BigDecimal,expectedCount:Int?) {
        if(!valid()) return
        val data=getData();val purchases=data.getJSONArray("purchases");val stock=data.getJSONObject("stock").getJSONArray("rolls")
        val byRoll=(0 until purchases.length()).mapNotNull { purchases.optJSONObject(it) }.filter { field(it,"company_id")==company.id }.associateBy { field(it,"roll_id") }
        val row=draft()?.optJSONObject("analysis")?.optJSONArray("rows")?.optJSONObject(index) ?: return
        val already=row.optJSONArray("_returnedRollIds")
        val rows=(0 until stock.length()).mapNotNull { stock.optJSONObject(it) }.filter { roll ->
            val purchase=byRoll[field(roll,"id")]
            purchase!=null && (already==null || (0 until already.length()).none { already.optString(it)==field(roll,"id") }) && field(roll,"company_id")==company.id && field(roll,"status")=="available" && field(purchase,"dealer_id")==field(dealer,"id") &&
                ReceiptReturnMatch.matches(brand,code,kind,field(roll,"brand"),field(roll,"product_code"),field(purchase,"price_type")) &&
                (field(roll,"remaining").toBigDecimalOrNull()?.let { it>BigDecimal.ZERO }==true) && roll.has("revision") && !roll.isNull("revision")
        }
        if(rows.isEmpty()) { say("이 대리점에서 입고한 같은 제품·방염 구분의 창고 롤을 찾지 못했습니다. 영수증과 재고를 확인해 주세요.");return }
        AlertDialog.Builder(activity).setTitle("반납할 롤 선택")
            .setItems(rows.take(100).map { "${field(it,"label").ifBlank { "필름 롤" }} · 잔량 ${field(it,"remaining")}m · ${field(it,"location").ifBlank { "위치 미입력" }}" }.toTypedArray()) { _,i ->
                enter(index,dealer,rows[i],brand,code,kind,total,expectedCount)
            }.setNegativeButton("취소",null).show()
    }
    private fun enter(index:Int,dealer:JSONObject,roll:JSONObject,brand:String,code:String,kind:String,total:BigDecimal,expectedCount:Int?) {
        val available=field(roll,"remaining").toBigDecimalOrNull() ?: return
        val form=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(30,8,30,8) }
        fun input(hintText:String,value:String)=EditText(activity).apply { hint=hintText;setSingleLine();inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL;filters=arrayOf(InputFilter.LengthFilter(16));setText(value);form.addView(this) }
        val amount=input("이 롤의 반납 길이 (m)",if(total<=available) total.toPlainString() else "")
        val credit=input("이 롤의 반납 정산금액 (원, 선택)","")
        val title="${field(dealer,"name")} · $brand $code · ${if(kind=="fire") "방염" else "비방염"}\n롤: ${field(roll,"label")} · 창고 잔량 ${available.toPlainString()}m\n영수증의 남은 반납량 ${total.toPlainString()}m"
        val dialog=AlertDialog.Builder(activity).setTitle("롤 반납 내용 입력").setMessage(title+"\n\n선택한 롤의 반납 길이만 재고에서 차감합니다. 정산금액을 비우면 금액은 기록하지 않습니다.")
            .setView(form).setNegativeButton("취소",null).setPositiveButton("내용 확인",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid()) return@setOnClickListener
            val quantity=amount.text.toString().trim().toBigDecimalOrNull();val rawCredit=credit.text.toString().trim();val money=if(rawCredit.isBlank()) null else rawCredit.toBigDecimalOrNull()
            if(quantity==null || quantity<=BigDecimal.ZERO || quantity>available || quantity>total || (rawCredit.isNotBlank() && (money==null || money<BigDecimal.ZERO || money>BigDecimal("1000000000000")))) { say("반납 길이와 정산금액을 확인해 주세요.");return@setOnClickListener }
            val body=JSONObject().put("action","supplier_return").put("requestId",UUID.randomUUID().toString()).put("dealerId",field(dealer,"id"))
                .put("rollId",field(roll,"id")).put("revision",roll.getInt("revision")).put("returnLength",quantity.toPlainString())
            if(money!=null) body.put("credit",money.toPlainString())
            val description="$title\n\n이번 반납: ${quantity.toPlainString()}m\n반납 정산금액: ${money?.toPlainString()?.plus("원") ?: "기록 안 함"}\n\n확인 후 재고에서 차감할까요?"
            AlertDialog.Builder(activity).setTitle("대리점 반납 확인").setMessage(description).setNegativeButton("돌아가기",null).setPositiveButton("반납 저장") { _,_ ->
                if(!valid() || busy || hasPending()) return@setPositiveButton
                val latest=draft();val row=latest?.optJSONObject("analysis")?.optJSONArray("rows")?.optJSONObject(index)
                if(row==null || row.optString("action")!="supplier_return" || row.optBoolean("_done") || row.has("_returnPending")) { say("영수증 상태가 변경됐습니다. 다시 확인해 주세요.");return@setPositiveButton }
                val previous=field(row,"_returnRemaining").ifBlank { total.toPlainString() }.toBigDecimalOrNull()
                if(previous==null || previous.compareTo(total)!=0) { say("남은 반납량이 변경됐습니다. 다시 확인해 주세요.");return@setPositiveButton }
                if(row.has("_returnDealer") && (field(row,"_returnDealer")!=field(dealer,"id") || field(row,"_returnBrand")!=brand || field(row,"_returnCode")!=code || field(row,"_returnType")!=kind)) { say("앞서 선택한 대리점 또는 제품이 변경됐습니다. 다시 확인해 주세요.");return@setPositiveButton }
                val used=row.optJSONArray("_returnedRollIds")
                if(used!=null && (0 until used.length()).any { used.optString(it)==field(roll,"id") }) { say("이미 반납한 롤입니다. 다른 롤을 확인해 주세요.");return@setPositiveButton }
                val nextCount=row.optInt("_returnCount",0)+1
                if(expectedCount!=null && (nextCount>expectedCount || (nextCount==expectedCount)!=(quantity.compareTo(total)==0))) { say("이번 반납 후 남은 길이와 영수증 롤 수가 맞지 않습니다. 롤과 반납 길이를 확인해 주세요.");return@setPositiveButton }
                val request=body.getString("requestId");row.put("_returnRemaining",total.toPlainString()).put("_returnPending",request)
                    .put("_returnBrand",brand).put("_returnCode",code).put("_returnType",kind).put("_returnDealer",field(dealer,"id"))
                row.put("_returnExpectedRolls",expectedCount ?: JSONObject.NULL)
                val saved=JSONObject().put("uid",uid).put("company",company.id).put("rowIndex",index).put("summary",description).put("body",body)
                if(!prefs.edit().putString(draftKey,latest.toString()).putString(pendingKey,saved.toString()).commit()) { say("반납 요청을 보관하지 못했습니다.");return@setPositiveButton }
                dialog.dismiss();run(saved)
            }.show()
        } };dialog.show()
    }
    fun reviewPending() {
        if(!valid() || busy) return
        val p=pending() ?: run { say("이전 반납 요청을 확인하지 못했습니다.");return }
        if(p.optString("uid")!=uid || p.optString("company")!=company.id) { say("반납을 시작한 계정과 업체를 확인해 주세요.");return }
        val builder=AlertDialog.Builder(activity).setTitle("이전 반납 결과 확인").setMessage(p.optString("summary")+"\n\n동일한 요청으로 다시 확인하면 중복 차감하지 않습니다.")
            .setNegativeButton("닫기",null).setPositiveButton("결과 다시 확인") { _,_ -> run(p) }
        if(p.optBoolean("rejected")) builder.setNeutralButton("거절된 요청 수정") { _,_ -> releaseRejected(p) }
        builder.show()
    }
    private fun run(p:JSONObject) {
        if(!valid() || busy || p.optString("uid")!=uid || p.optString("company")!=company.id) return
        val body=p.optJSONObject("body") ?: return;val id=body.optString("requestId")
        if(pending()?.optJSONObject("body")?.optString("requestId")!=id) return
        busy=true
        scope.launch {
            var saved:JSONObject?=null
            try {
                val data=auth.dealerInventory(uid,company.id,body)
                if(!valid()) return@launch
                val current=pending();check(current?.optJSONObject("body")?.optString("requestId")==id)
                val raw=prefs.getString(draftKey,null) ?: error("영수증을 확인하지 못했습니다.")
                val updated=ReceiptReturnState.complete(raw,p.optInt("rowIndex",-1),id,body.getString("returnLength"),body.getString("rollId"))
                check(prefs.edit().putString(draftKey,updated).remove(pendingKey).commit()) { "반납은 확인했지만 휴대전화 상태를 저장하지 못했습니다." }
                saved=data
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) {
                if(e is FilmRejected && pending()?.optJSONObject("body")?.optString("requestId")==id) {
                    val current=pending();current?.put("rejected",true);if(current!=null) prefs.edit().putString(pendingKey,current.toString()).commit()
                }
                if(valid()) AlertDialog.Builder(activity).setTitle("반납 결과 확인 필요").setMessage((e.message ?: "결과를 확인하지 못했습니다.")+"\n\n이전 요청을 보관했습니다. 같은 요청으로 다시 확인해 주세요.").setPositiveButton("확인",null).show()
            } finally { busy=false;saved?.let { if(valid()) { onData(it);onResume() } } }
        }
    }
    private fun releaseRejected(p:JSONObject) {
        AlertDialog.Builder(activity).setTitle("거절된 반납 요청 수정")
            .setMessage("서버가 요청을 거절했습니다. 현재 재고를 다시 조회한 후 이 요청을 닫고 다시 입력할까요?")
            .setNegativeButton("유지",null).setPositiveButton("조회 후 다시 입력") { _,_ ->
                if(!valid() || busy) return@setPositiveButton
                busy=true;scope.launch {
                    try {
                        val data=auth.dealerInventory(uid,company.id);if(!valid()) return@launch
                        val latest=pending();val id=p.optJSONObject("body")?.optString("requestId")
                        check(latest?.optBoolean("rejected")==true && latest.optJSONObject("body")?.optString("requestId")==id)
                        val d=draft() ?: error("영수증을 확인하지 못했습니다.");val row=d.getJSONObject("analysis").getJSONArray("rows").getJSONObject(p.getInt("rowIndex"))
                        check(row.optString("_returnPending")==id);row.remove("_returnPending")
                        if(row.optInt("_returnCount",0)==0) listOf("_returnRemaining","_returnBrand","_returnCode","_returnType","_returnDealer","_returnExpectedRolls").forEach { row.remove(it) }
                        check(prefs.edit().putString(draftKey,d.toString()).remove(pendingKey).commit())
                        onData(data);onResume()
                    } catch(e:CancellationException) { throw e }
                      catch(e:Exception) { if(valid()) say(e.message ?: "현재 재고를 확인하지 못했습니다.") }
                    finally { busy=false }
                }
            }.show()
    }
}
