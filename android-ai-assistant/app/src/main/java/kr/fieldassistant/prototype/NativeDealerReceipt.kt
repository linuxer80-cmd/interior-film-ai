package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import kotlinx.coroutines.CoroutineScope
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.util.UUID

/** A receipt is a reviewable draft; each confirmed row uses the ordinary idempotent receive API. */
internal class NativeDealerReceipt(
    private val activity:Activity, private val auth:AccountAuth, private val scope:CoroutineScope, private val uid:String, private val company:CompanyAccess,
    private var data:JSONObject, private val valid:()->Boolean, private val send:(String)->Unit,
) {
    private val prefs=activity.getSharedPreferences("assistant_user_"+uid,Context.MODE_PRIVATE)
    private val key="dealer_receipt_draft_"+company.id
    private val pendingKey="dealer_receive_pending_"+company.id
    private fun msg(s:String) { if(valid()) AlertDialog.Builder(activity).setMessage(s).setPositiveButton("확인",null).show() }
    private fun draft():JSONObject?=try { prefs.getString(key,null)?.let { JSONObject(it) } } catch(_:Exception) { null }
    private fun field(row:JSONObject,k:String)=row.optString(k).takeUnless { it.isBlank() || it=="null" }.orEmpty()
    private val setup by lazy { NativeDealerSetup(activity,auth,scope,uid,company,valid,{ data }) { updated,index ->
        data=updated
        val saved=draft();val rows=saved?.optJSONObject("analysis")?.optJSONArray("rows")
        if(saved!=null && rows!=null && index in 0 until rows.length()) row(saved,index) else show()
    } }
    private val returns by lazy { NativeDealerReturn(activity,auth,scope,uid,company,valid,{ data },{ data=it },{ show() }) }
    fun store(result:JSONObject) {
        check(valid() && company.role=="관리자")
        check(draft()==null && !prefs.contains(pendingKey)) { "이전 영수증이나 입고 결과를 먼저 확인해 주세요." }
        val rows=result.optJSONArray("rows") ?: error("분석 결과를 확인하지 못했습니다.")
        require(rows.length()<=100)
        val record=JSONObject().put("uid",uid).put("companyId",company.id).put("analysis",result)
        check(prefs.edit().putString(key,record.toString()).commit()) { "분석 결과를 저장하지 못했습니다." }
        show()
    }
    fun show() {
        if(!valid()) return
        if(returns.hasPending()) { returns.reviewPending();return }
        if(setup.hasPending()) { setup.reviewPending();return }
        val record=draft() ?: return
        if(record.optString("uid")!=uid || record.optString("companyId")!=company.id) { msg("업체와 계정을 다시 확인해 주세요.");return }
        val a=record.optJSONObject("analysis") ?: return
        val rows=a.optJSONArray("rows") ?: return
        val warnings=a.optJSONArray("warnings")
        val intro=listOf(field(a,"dealer"),field(a,"date")).filter { it.isNotBlank() }.joinToString(" · ")
        val notes=(0 until (warnings?.length() ?: 0)).map { warnings!!.optString(it) }.filter { it.isNotBlank() }.joinToString("\n")
        val labels=(0 until rows.length()).map { i ->
            val r=rows.getJSONObject(i);val status=if(r.optBoolean("_done")) "저장됨" else when(field(r,"action")) { "receive"->"확인 필요";"supplier_return"->if(r.has("_returnRemaining")) "반납 진행 · 남은 ${field(r,"_returnRemaining")}m" else "대리점 반납";else->"구분 확인 필요" }
            "${i+1}. ${field(r,"brand")} ${field(r,"code").ifBlank { field(r,"name") }} · $status\n인식 물량 ${field(r,"totalM").ifBlank { "확인 필요" }}m"
        }
        val builder=AlertDialog.Builder(activity).setTitle("영수증 품목 확인")
        if(labels.isEmpty()) builder.setMessage("읽은 품목이 없습니다. 사진을 다시 확인해 주세요.\n$notes")
        else builder.setItems(labels.toTypedArray()) { _,i -> row(record,i) }
        builder.setNegativeButton("닫기",null).setNeutralButton("영수증 정보") { _,_ -> msg("$intro\n$notes\n\n입고·반납 품목별 수량과 방염 구분을 확인해 주세요. 반납은 해당 창고 롤을 한 개씩 선택합니다.") }
            .setPositiveButton("작업 마치기") { _,_ ->
                if(prefs.contains(pendingKey)) { msg("확인되지 않은 입고 요청이 있습니다. 입고 결과부터 확인해 주세요.");return@setPositiveButton }
                AlertDialog.Builder(activity).setTitle("영수증 작업 마치기").setMessage("아직 확인하지 않은 물량은 저장되지 않습니다. 일부 반납한 물량은 이미 저장되어 있으며, 분석 결과를 닫으면 남은 물량은 다시 확인해야 합니다. 이 작업을 마칠까요?")
                    .setNegativeButton("돌아가기") { _,_ -> show() }.setPositiveButton("마치기") { _,_ -> if(valid()) prefs.edit().remove(key).commit() }.show()
            }.show()
    }
    private fun row(record:JSONObject,index:Int) {
        if(!valid()) return
        if(returns.hasPending()) { returns.reviewPending();return }
        if(setup.hasPending()) { setup.reviewPending();return }
        val r=record.getJSONObject("analysis").getJSONArray("rows").getJSONObject(index)
        if(r.optBoolean("_done")) { msg("이미 입고가 확인된 품목입니다.");return }
        if(prefs.contains(pendingKey)) { msg("이전 입고 결과를 먼저 확인해 주세요.");return }
        if(field(r,"action")=="supplier_return") { returns.open(record,index);return }
        if(field(r,"action")!="receive") { msg("입고 또는 반납 구분이 불확실한 품목입니다. 영수증을 다시 확인해 주세요.");return }
        val dealers=data.getJSONArray("dealers");val list=(0 until dealers.length()).mapNotNull { dealers.optJSONObject(it) }
        val code=field(r,"code").uppercase().replace(" ","")
        val initial=if(Regex("^([GF][A-Z][A-Z0-9-]*[0-9][A-Z0-9-]*|[RE]S[0-9][A-Z0-9-]*)$").matches(code)) code.drop(1) else code
        val detectedDealer=field(record.getJSONObject("analysis"),"dealer")
        AlertDialog.Builder(activity).setTitle("대리점 선택 · 인식: ${field(record.getJSONObject("analysis"),"dealer").ifBlank { "확인 필요" }}")
            .setItems((list.map { field(it,"name") }+"＋ 대리점 등록").toTypedArray()) { _,i ->
                if(i==list.size) setup.dealer(null,detectedDealer,index)
                else {
                    val dealer=list[i]
                    AlertDialog.Builder(activity).setTitle(field(dealer,"name"))
                        .setItems(arrayOf("이 대리점으로 계속","대리점 정보 수정")) { _,action ->
                            if(action==0) chooseProduct(record,index,dealer,initial) else setup.dealer(dealer,"",index)
                        }.setNegativeButton("취소") { _,_ -> row(record,index) }.show()
                }
            }
            .setNegativeButton("취소") { _,_ -> show() }.show()
    }
    private fun chooseProduct(record:JSONObject,index:Int,dealer:JSONObject,query:String) {
        if(!valid()) return
        val r=record.getJSONObject("analysis").getJSONArray("rows").getJSONObject(index)
        val q=query.trim();val prices=data.getJSONArray("prices")
        val list=(0 until prices.length()).mapNotNull { prices.optJSONObject(it) }.filter { p -> p.optString("dealer_id")==dealer.optString("id") && p.optBoolean("is_active",true) && p.optString("price_type") in listOf("fire","non_fire") && (q.isBlank() || listOf("brand","product_code","product_name").any { field(p,it).contains(q,true) }) }
        val names=list.take(100).map { p -> "${field(p,"brand")} ${field(p,"product_code")} · ${if(field(p,"price_type")=="fire") "방염" else "비방염"} · ${field(p,"unit_price")}원/m" }
        val b=AlertDialog.Builder(activity).setTitle("입고 제품 선택 · ${field(r,"code")}")
        if(names.isEmpty()) b.setMessage("검색 결과가 없습니다. 제품번호를 바꿔 검색하거나 공급가를 먼저 등록해 주세요.")
        else b.setItems(names.toTypedArray()) { _,i -> enter(record,index,dealer,list[i]) }
        b.setPositiveButton("＋ 제품·공급가 등록") { _,_ -> setup.product(dealer,field(r,"brand"),q,index) }
        b.setNegativeButton("뒤로") { _,_ -> row(record,index) }.setNeutralButton("제품 검색") { _,_ ->
            val input=EditText(activity).apply { setSingleLine();setText(q);hint="제품번호 또는 제조사" }
            AlertDialog.Builder(activity).setTitle("제품 검색").setView(input).setNegativeButton("취소") { _,_ -> show() }
                .setPositiveButton("검색") { _,_ -> chooseProduct(record,index,dealer,input.text.toString()) }.show()
        }.show()
    }
    private fun enter(record:JSONObject,index:Int,dealer:JSONObject,price:JSONObject) {
        if(!valid()) return
        val r=record.getJSONObject("analysis").getJSONArray("rows").getJSONObject(index)
        val form=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(30,8,30,8) }
        fun input(h:String,initial:String,number:Boolean)=EditText(activity).apply { hint=h;setSingleLine();setText(initial);if(number) inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL;filters=arrayOf(android.text.InputFilter.LengthFilter(if(number) 16 else 100));form.addView(this) }
        val length=input("한 롤 길이 (m)",field(r,"lengthM"),true);val count=input("같은 길이의 롤 수 (1~50)",field(r,"rollCount"),true);val location=input("보관 위치","창고",false)
        val type=if(field(price,"price_type")=="fire") "방염" else "비방염"
        val detectedType=when(field(r,"priceType")) { "fire"->"방염";"non_fire"->"비방염";else->"확인 필요" }
        val info="인식: ${field(r,"brand")} ${field(r,"code")} · $detectedType · 총 ${field(r,"totalM").ifBlank { "확인 필요" }}m\n선택: ${field(dealer,"name")} · ${field(price,"brand")} ${field(price,"product_code")} · $type · ${field(price,"unit_price")}원/m\n\n사진과 비교해 확인해 주세요."
        val dialog=AlertDialog.Builder(activity).setTitle("입고 내용 확인").setMessage(info).setView(form).setNegativeButton("취소") { _,_ -> show() }
            .setNeutralButton("공급가 수정") { _,_ -> setup.price(dealer,price,index) }.setPositiveButton("저장 내용 확인",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid()) return@setOnClickListener
            val m=length.text.toString().trim().toBigDecimalOrNull();val n=count.text.toString().trim().toIntOrNull()
            if(m==null || m<=BigDecimal.ZERO || m>BigDecimal(1000000) || n==null || n !in 1..50 || !price.has("revision") || price.isNull("revision")) { msg("한 롤 길이와 롤 수, 공급가 정보를 확인해 주세요.");return@setOnClickListener }
            if(field(r,"priceType") in listOf("fire","non_fire") && field(r,"priceType")!=field(price,"price_type")) { msg("사진에서 읽은 방염 구분과 선택한 제품이 다릅니다. 영수증을 다시 확인해 주세요. 사진 인식이 잘못된 경우 직접 입고할 수 있습니다.");return@setOnClickListener }
            val total=field(r,"totalM").toBigDecimalOrNull()
            if(total!=null && total>BigDecimal.ZERO && m.multiply(BigDecimal(n)).subtract(total).abs()>BigDecimal("0.001")) { msg("한 롤 길이 × 롤 수가 사진에서 읽은 총 길이와 다릅니다. 영수증을 확인해 주세요.");return@setOnClickListener }
            val body=JSONObject().put("action","receive").put("requestId",UUID.randomUUID().toString()).put("dealerId",field(dealer,"id")).put("productId",field(price,"product_id")).put("priceType",field(price,"price_type")).put("priceRevision",price.getInt("revision")).put("length",m.toPlainString()).put("count",n).put("location",location.text.toString().trim()).put("memo","영수증 사진 확인 후 입고")
            AlertDialog.Builder(activity).setTitle("입고 저장 확인").setMessage("$info\n\n${m.toPlainString()}m × ${n}롤\n보관 위치: ${body.optString("location").ifBlank { "창고" }}\n\n재고에 입고할까요?")
                .setNegativeButton("돌아가기",null).setPositiveButton("입고 저장") { _,_ ->
                    if(!valid() || prefs.contains(pendingKey)) { msg("이전 입고 결과를 먼저 확인해 주세요.");return@setPositiveButton }
                    val latest=draft();val row=latest?.optJSONObject("analysis")?.optJSONArray("rows")?.optJSONObject(index)
                    if(row==null || row.optBoolean("_done") || row.has("_requestId")) { msg("영수증 상태가 변경되었습니다. 다시 확인해 주세요.");return@setPositiveButton }
                    row.put("_requestId",body.getString("requestId"))
                    val raw=body.toString()
                    if(!prefs.edit().putString(key,latest.toString()).putString(pendingKey,raw).commit()) { msg("입고 요청을 보관하지 못했습니다.");return@setPositiveButton }
                    dialog.dismiss();send(raw)
                }.show()
        } };dialog.show()
    }
    companion object {
        fun complete(prefs:SharedPreferences,companyId:String,raw:String):Boolean {
            val pendingKey="dealer_receive_pending_"+companyId
            if(prefs.getString(pendingKey,null)!=raw) return false
            val key="dealer_receipt_draft_"+companyId
            val stored=prefs.getString(key,null)
            val editor=prefs.edit()
            if(stored!=null) {
                val id=try { JSONObject(raw).getString("requestId") } catch(_:Exception) { return false }
                val updated=try { DealerReceiptState.confirmed(stored,id) } catch(_:Exception) { return false }
                editor.putString(key,updated)
            }
            return editor.remove(pendingKey).commit()
        }
        fun prepare(context:Context,uri:Uri):ByteArray {
            require(uri.scheme=="content")
            val bytes=context.contentResolver.openInputStream(uri)?.use { stream ->
                val out=ByteArrayOutputStream();val buffer=ByteArray(32768)
                while(true) { val n=stream.read(buffer);if(n<0) break;require(out.size()+n<=20000000) { "20MB 이하 사진을 선택해 주세요." };out.write(buffer,0,n) };out.toByteArray()
            } ?: error("사진을 읽지 못했습니다.")
            val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true };BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
            require(bounds.outWidth>0 && bounds.outHeight>0 && bounds.outWidth.toLong()*bounds.outHeight<=40000000L) { "사진 크기나 형식을 확인해 주세요." }
            var sample=1;while(maxOf(bounds.outWidth,bounds.outHeight)/sample>2200) sample*=2
            val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().apply { inSampleSize=sample }) ?: error("사진을 열지 못했습니다.")
            val orientation=try { ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL) } catch(_:Exception) { ExifInterface.ORIENTATION_NORMAL }
            val matrix=Matrix();when(orientation) {
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL->matrix.setScale(-1f,1f);ExifInterface.ORIENTATION_ROTATE_180->matrix.setRotate(180f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL->matrix.setScale(1f,-1f);ExifInterface.ORIENTATION_TRANSPOSE->{ matrix.setRotate(90f);matrix.postScale(-1f,1f) }
                ExifInterface.ORIENTATION_ROTATE_90->matrix.setRotate(90f);ExifInterface.ORIENTATION_TRANSVERSE->{ matrix.setRotate(270f);matrix.postScale(-1f,1f) };ExifInterface.ORIENTATION_ROTATE_270->matrix.setRotate(270f)
            }
            var current=bitmap
            try {
                if(!matrix.isIdentity) current=Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true)
                for(size in listOf(2200,1800,1400,1000)) {
                    if(maxOf(current.width,current.height)>size) { val scale=size.toFloat()/maxOf(current.width,current.height);val next=Bitmap.createScaledBitmap(current,maxOf(1,(current.width*scale).toInt()),maxOf(1,(current.height*scale).toInt()),true);if(current!==bitmap && current!==next) current.recycle();current=next }
                    for(q in listOf(90,80,70,60)) { val out=ByteArrayOutputStream();check(current.compress(Bitmap.CompressFormat.JPEG,q,out));if(out.size()<=550000) return out.toByteArray() }
                }
                error("영수증 부분을 잘라 다시 선택해 주세요.")
            } finally { if(current!==bitmap) current.recycle();bitmap.recycle() }
        }
    }
}
