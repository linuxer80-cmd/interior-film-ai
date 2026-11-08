package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.widget.*
import kotlinx.coroutines.*
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

/** Native review forms. All writes retain the existing server authorization and idempotency. */
class ReceiptSettlementActivity:Activity() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
    private val auth by lazy { AccountAuth.shared(this) }
    private val uid get()=intent.getStringExtra("user").orEmpty()
    private val company get()=intent.getStringExtra("company").orEmpty()
    private val receipt get()=intent.getStringExtra("mode")=="receipt"
    private val prefs by lazy { getSharedPreferences("assistant_user_$uid",MODE_PRIVATE) }
    private val key get()="native_finance_${company}_"+if(receipt)"receipt" else "settlement"
    private val ui by lazy { BusinessUi(this) }
    private lateinit var content:LinearLayout
    private var busy=false
    private var data=JSONObject()
    private var draft=JSONObject()
    private fun valid()=!isFinishing&&!isDestroyed&&prefs.getString("selected_company",null)==company
    private fun notice(s:String){if(valid())Toast.makeText(this,s,Toast.LENGTH_LONG).show()}
    private fun rows(o:JSONObject,k:String)=NativeFinanceRules.rows(o,k)
    private fun value(o:JSONObject,k:String)=o.optString(k).takeUnless { it=="null" }.orEmpty()
    private fun save(){check(prefs.edit().putString(key,draft.toString()).commit()) { "입력 내용을 보관하지 못했습니다." }}
    private fun label(s:String,parent:LinearLayout=content){parent.addView(ui.text(s),LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=ui.dp(10) })}
    private fun button(s:String,parent:LinearLayout=content,action:()->Unit){parent.addView(ui.button(s).apply { setOnClickListener { if(valid()&&!busy)action() else notice("처리 중입니다.") } })}
    private fun field(parent:LinearLayout,title:String,initial:String="",number:Boolean=false):EditText {
        label(title,parent)
        return EditText(this).apply { setText(initial);hint=title;filters=arrayOf(android.text.InputFilter.LengthFilter(500));if(number)inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL;parent.addView(this) }
    }
    private fun task(block:suspend ()->Unit){if(busy||!valid())return;busy=true;scope.launch { try{block()}catch(e:CancellationException){throw e}catch(e:Exception){notice(e.message?:"다시 확인해 주세요.")}finally{busy=false} }}
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        if(uid.isBlank()||company.isBlank()){finish();return}
        draft=runCatching { JSONObject(prefs.getString(key,"{}").orEmpty()) }.getOrDefault(JSONObject())
        val root=LinearLayout(this).apply { orientation=1;setBackgroundColor(ui.canvas);setOnApplyWindowInsetsListener { v,i->val a=i.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.ime());v.setPadding(a.left,a.top,a.right,a.bottom);android.view.WindowInsets.CONSUMED } }
        window.setDecorFitsSystemWindows(false)
        root.addView(ui.button("‹ 업무로").apply { setOnClickListener { if(!busy)finish() } })
        content=LinearLayout(this).apply { orientation=1;setPadding(ui.dp(18),ui.dp(12),ui.dp(18),ui.dp(24)) }
        root.addView(ScrollView(this).apply { addView(content) });setContentView(root);root.requestApplyInsets()
        label("불러오는 중…");button("다시 확인"){load()};load()
    }
    private fun load(){task { data=if(receipt)auth.dealerInventory(uid,company) else auth.tradeClients(uid,company);if(valid())render() }}
    private fun render(){
        content.removeAllViews();ui.heading(content,if(receipt)"영수증 사진 입고" else "거래처 일괄 정산","내용을 확인한 뒤 저장합니다")
        if(draft.has("pending")) {
            label("이전 저장 결과를 확인해야 합니다. 같은 요청으로 다시 확인하므로 중복 저장되지 않습니다.")
            button("이전 저장 결과 확인"){submit()};return
        }
        if(receipt)renderReceipt() else renderSettlement()
    }
    private fun renderReceipt(){
        button("공급가 · 재고 새로 확인"){load()}
        button("영수증 사진 선택 · 분석") {
            val choose={startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="image/*";addCategory(Intent.CATEGORY_OPENABLE) },81)}
            if(draft.has("analysis"))AlertDialog.Builder(this).setMessage("현재 분석 목록을 새 사진으로 바꿀까요? 이미 저장한 입고는 유지됩니다.").setPositiveButton("사진 선택"){_,_->choose()}.setNegativeButton("취소",null).show() else choose()
        }
        val analysis=draft.optJSONObject("analysis") ?: return
        label("인식한 공급자: "+value(analysis,"dealer")+" · 날짜: "+value(analysis,"date"))
        label("입고 날짜·단가는 기존 입고 규칙과 선택한 공급가를 사용합니다. 사진 속 금액과 비교해 확인해 주세요.")
        val warnings=analysis.optJSONArray("warnings");if(warnings!=null)label((0 until warnings.length()).joinToString("\n"){warnings.optString(it)})
        val dealers=rows(data,"dealers")
        button("입고 대리점: "+dealers.find { it.optString("id")==draft.optString("dealerId") }?.optString("name").orEmpty().ifBlank { "선택 필요" }) {
            AlertDialog.Builder(this).setTitle("실제 공급 대리점 선택").setItems(dealers.map { it.optString("name") }.toTypedArray()){_,i->draft.put("dealerId",dealers[i].getString("id"));save();render()}.setNegativeButton("닫기",null).show()
        }
        val items=rows(analysis,"rows")
        if(items.isEmpty())label("인식된 필름 품목이 없습니다. 사진을 다시 선택해 주세요.")
        items.forEachIndexed { i,row ->
            val box=ui.card(content)
            label("${i+1}. ${value(row,"brand")} ${value(row,"code")} ${value(row,"name")}",box)
            label("원문: ${value(row,"raw")}\n총 길이 ${value(row,"totalM").ifBlank { "확인 필요" }}m · 품목 금액 ${value(row,"amount").ifBlank { "미확인" }}원",box)
            row.optJSONArray("issues")?.let { a->label((0 until a.length()).joinToString("\n"){a.optString(it)},box) }
            if(row.optBoolean("saved"))label("입고 저장 완료",box)
            else if(value(row,"action")=="supplier_return")label("대리점 반품 품목입니다. 입고로 저장하지 않습니다.",box)
            else button("제품 확인 · 입고",box){choosePrice(i,row)}
        }
    }
    private fun choosePrice(index:Int,row:JSONObject){
        val dealer=draft.optString("dealerId")
        if(dealer.isBlank()){notice("실제 공급 대리점을 먼저 선택해 주세요.");return}
        val query=EditText(this).apply { setText(value(row,"code"));hint="제품번호 또는 브랜드" }
        AlertDialog.Builder(this).setTitle("입고 제품 검색").setView(query).setPositiveButton("찾기"){_,_->
            val q=query.text.toString().trim()
            if(q.isBlank()){notice("제품번호를 입력해 주세요.");return@setPositiveButton}
            val prices=rows(data,"prices").filter { it.optString("dealer_id")==dealer&&it.optBoolean("is_active",true)&&listOf("product_code","brand","product_name").any { k->value(it,k).contains(q,true) } }
            if(prices.isEmpty()){notice("등록된 공급가가 없습니다. 대리점 제품·공급가 등록 후 다시 확인해 주세요.");return@setPositiveButton}
            AlertDialog.Builder(this).setTitle("제품 · 방염 · 공급가 확인").setItems(prices.map { "${value(it,"brand")} ${value(it,"product_code")} · ${if(value(it,"price_type")=="fire")"방염" else if(value(it,"price_type")=="non_fire")"비방염" else "구분 미지정"} · ${value(it,"unit_price")}원/m" }.toTypedArray()){_,i->editReceipt(index,row,prices[i])}.setNegativeButton("취소",null).show()
        }.setNegativeButton("취소",null).show()
    }
    private fun editReceipt(index:Int,row:JSONObject,price:JSONObject){
        val box=LinearLayout(this).apply { orientation=1;setPadding(ui.dp(18),0,ui.dp(18),0) }
        val length=field(box,"롤당 길이(m)",value(row,"lengthM"),true)
        val count=field(box,"같은 길이의 롤 수",value(row,"rollCount"),true)
        val total=field(box,"확인한 총 길이(m)",value(row,"totalM"),true)
        label("롤 구성이 다르면 사진을 다시 나누어 분석해 주세요. 임의로 한 롤로 합치지 않습니다.",box)
        val confirm=CheckBox(this).apply { text="제품·방염·공급가와 실제 입고 물량을 확인했습니다";box.addView(this) }
        val dialog=AlertDialog.Builder(this).setTitle("${value(price,"product_code")} · 입고 확인").setView(ScrollView(this).apply { addView(box) }).setPositiveButton("입고 저장",null).setNegativeButton("취소",null).create()
        dialog.setOnShowListener { dialog.getButton(-1).setOnClickListener {
            try {
                check(valid() && !busy && !draft.has("pending")){"진행 중인 요청을 먼저 확인해 주세요."}
                check(confirm.isChecked){"실제 입고 내용을 확인해 주세요."}
                val (m,n)=NativeFinanceRules.validateRoll(length.text.toString(),count.text.toString(),total.text.toString())
                val body=JSONObject().put("action","receive").put("requestId",UUID.randomUUID().toString()).put("dealerId",draft.getString("dealerId")).put("productId",price.getString("product_id")).put("priceType",price.getString("price_type")).put("priceRevision",price.getInt("revision")).put("length",m.toPlainString()).put("count",n).put("location","창고").put("memo","영수증 확인: "+value(row,"raw").take(300))
                row.put("lengthM",m.toPlainString()).put("rollCount",n).put("totalM",total.text.toString())
                draft.put("pending",body).put("rowIndex",index);save();dialog.dismiss();render();submit()
            }catch(e:Exception){notice(e.message?:"입력을 확인해 주세요.")}
        } };dialog.show()
    }
    override fun onActivityResult(requestCode:Int,resultCode:Int,result:Intent?){
        super.onActivityResult(requestCode,resultCode,result)
        if(requestCode!=81||resultCode!=RESULT_OK)return
        val uri=result?.data?:return
        task { notice("영수증을 분석하고 있습니다.");val image=withContext(Dispatchers.IO){ChatPhotoEncoder.encode(this@ReceiptSettlementActivity,uri,600000)};val analysis=auth.analyzeDealerReceipt(uid,company,image);if(valid()){draft=JSONObject().put("analysis",analysis);save();render()} }
    }
    private fun renderSettlement(){
        val clients=rows(data,"clients")
        if(clients.isEmpty())label("등록된 거래처가 없습니다.")
        clients.forEach { client->button(value(client,"name")){settlementForm(client)} }
        rows(data,"batches").take(20).forEach { label("최근 정산 · ${value(it,"paid_on")} · ${value(it,"amount")}원"+if(!it.isNull("voided_at"))" · 취소됨" else "") }
        button("새로 확인"){load()}
    }
    private fun settlementForm(client:JSONObject){
        try {
            val sites=NativeFinanceRules.eligible(data,client.getString("id"));if(sites.isEmpty()){notice("확인된 미수금이 없습니다.");return}
            val box=LinearLayout(this).apply { orientation=1;setPadding(ui.dp(18),0,ui.dp(18),0) }
            val total=field(box,"실제 받은 총액(원)","",true)
            val date=field(box,"입금일 YYYY-MM-DD",ScheduleDates.today())
            val amounts=sites.map { field(box,"${value(it,"site_name")} · 미수 ${value(it,"outstanding")}원","0",true) }
            button("오래된 현장부터 자동 배분",box){try{var left=NativeFinanceRules.money(total.text.toString());sites.forEachIndexed{i,s->val n=minOf(left,NativeFinanceRules.money(value(s,"outstanding")));amounts[i].setText(n.toString());left-=n};if(left>0)notice("입금액이 미수금 합계를 넘습니다.")}catch(e:Exception){notice(e.message.orEmpty())}}
            val check=CheckBox(this).apply { text="실제 입금과 현장별 배분을 확인했습니다";box.addView(this) }
            val dialog=AlertDialog.Builder(this).setTitle(value(client,"name")+" · 일괄 정산").setView(ScrollView(this).apply { addView(box) }).setPositiveButton("최종 확인",null).setNegativeButton("취소",null).create()
            dialog.setOnShowListener { dialog.getButton(-1).setOnClickListener {try{
                require(check.isChecked){"실제 입금과 배분액을 확인해 주세요."}
                val n=NativeFinanceRules.money(total.text.toString());val values=amounts.map { NativeFinanceRules.money(it.text.toString()) };NativeFinanceRules.validateAllocation(n,sites,values)
                val day=java.time.LocalDate.parse(date.text.toString()).toString();require(day>="2000-01-01"&&day<="2099-12-31")
                val allocations=JSONArray();sites.forEachIndexed{i,s->if(values[i]>0)allocations.put(JSONObject().put("siteId",s.getString("id")).put("revision",s.getInt("revision")).put("contractAmount",s.get("contract_amount")).put("amount",values[i]))}
                val body=JSONObject().put("action","pay").put("requestId",UUID.randomUUID().toString()).put("clientId",client.getString("id")).put("contactScope","all").put("amount",n).put("paidOn",day).put("allocations",allocations)
                val summary=sites.indices.filter{values[it]>0}.joinToString("\n"){value(sites[it],"site_name")+" · "+values[it]+"원"}
                AlertDialog.Builder(this).setTitle("${n}원 · ${day}").setMessage(summary).setPositiveButton("정산 저장"){_,_->if(valid()&&!busy&&!draft.has("pending")){try{draft=JSONObject().put("pending",body);save();dialog.dismiss();render();submit()}catch(e:Exception){notice(e.message?:"정산 요청을 보관하지 못했습니다.")}}}.setNegativeButton("돌아가기",null).show()
            }catch(e:Exception){notice(e.message?:"금액과 날짜를 확인해 주세요.")} } };dialog.show()
        }catch(e:Exception){notice(e.message.orEmpty())}
    }
    private fun submit(){
        val body=draft.optJSONObject("pending")?:return
        task { try {
            data=if(receipt)auth.dealerInventory(uid,company,body) else auth.tradeClients(uid,company,body)
            if(!valid())return@task
            if(receipt)draft.getJSONObject("analysis").getJSONArray("rows").getJSONObject(draft.getInt("rowIndex")).put("saved",true)
            draft.remove("pending");save();notice(if(receipt)"입고를 저장했습니다." else "일괄 정산을 저장했습니다.")
            if(!receipt) { try { data=auth.tradeClients(uid,company) } catch(e:CancellationException){throw e} catch(_:Exception){data=JSONObject();notice("정산은 저장됐습니다. 최신 목록은 다시 확인해 주세요.")} }
            if(valid())render()
        }catch(e:Exception){
            if(e is CancellationException)throw e
            if(valid() && (e is FilmRejected || (e is TradeApiFailure && e.status in listOf(400,403,409)))){draft.remove("pending");save();render()}
            throw e
        } }
    }
    override fun onDestroy(){scope.cancel();super.onDestroy()}
}
