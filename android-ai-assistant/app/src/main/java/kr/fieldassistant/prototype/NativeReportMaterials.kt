package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.text.InputFilter
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.math.BigDecimal
import java.util.UUID

/** Uses the same stock and site-operation APIs as the existing report screen. */
internal class NativeReportMaterials(
    private val activity:Activity, private val auth:AccountAuth, private val scope:CoroutineScope,
    private val uid:String, private val company:CompanyAccess, private val siteId:String,
    private val siteName:String, private val valid:()->Boolean,
) {
    private val prefs=activity.getSharedPreferences("assistant_user_"+uid,Context.MODE_PRIVATE)
    private val pendingKey="native_report_material_pending"
    private var busy=false
    private fun toast(text:String)=Toast.makeText(activity,text,Toast.LENGTH_LONG).show()
    private fun pending():JSONObject?=try { prefs.getString(pendingKey,null)?.let { JSONObject(it) } } catch(_:Exception) { null }
    private fun clean(row:JSONObject,key:String)=row.optString(key).takeUnless { it.isBlank() || it=="null" }.orEmpty()
    private fun number(value:String):BigDecimal?=ReportMaterialInput.number(value)
    private fun display(value:String)=value.ifBlank { "미확인" }

    fun open() {
        if(!valid() || busy) return
        val saved=pending()
        if(saved!=null) { showPending(saved);return }
        busy=true
        scope.launch {
            try {
                val support=auth.assistantReportSupport(uid,company.id,siteId)
                val stock=auth.filmStock(uid,company.id,siteId)
                if(!valid()) return@launch
                val operations=support.getJSONObject("operations")
                val materials=operations.getJSONArray("materials")
                val trips=stock.getJSONArray("trips")
                val items=(0 until materials.length()).map { materials.getJSONObject(it) }
                val rows=(0 until trips.length()).map { trips.getJSONObject(it) }
                check(rows.all { clean(it,"site_id").isNotBlank() && clean(it,"material_id").isNotBlank() }) { "롤 연결 정보를 확인하지 못했습니다. 다시 확인해 주세요." }
                if(items.isEmpty()) {
                    AlertDialog.Builder(activity).setTitle("$siteName · 자재 확인")
                        .setMessage("등록된 현장 자재가 없습니다. 관리자가 사용할 자재를 등록한 뒤 다시 확인해 주세요.")
                        .setPositiveButton("확인",null).show();return@launch
                }
                val labels=items.map { m ->
                    val title=listOf(clean(m,"brand"),clean(m,"code").ifBlank { clean(m,"name") }).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "자재" }
                    val ret=if(!m.has("returned") || m.isNull("returned")) "미확인" else clean(m,"returned")
                    "$title · 반출 ${display(clean(m,"issued"))} / 반납 $ret ${clean(m,"unit")}"
                }
                AlertDialog.Builder(activity).setTitle("$siteName · 자재 확인")
                    .setItems(labels.toTypedArray()) { _,index ->
                        if(valid()) showMaterial(items[index],rows.filter { clean(it,"site_id")==siteId && clean(it,"material_id")==clean(items[index],"id") },operations,stock)
                    }.setNegativeButton("닫기",null).show()
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) toast(e.message ?: "자재를 확인하지 못했습니다.") }
            finally { busy=false }
        }
    }

    private fun showMaterial(m:JSONObject,trips:List<JSONObject>,operations:JSONObject,stock:JSONObject) {
        if(!valid()) return
        val title=listOf(clean(m,"brand"),clean(m,"code").ifBlank { clean(m,"name") }).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "자재" }
        if(trips.isEmpty()) {
            if(operations.optBoolean("locked",true) || !operations.optBoolean("canReturn",false)) { toast("현재 자재 수량을 수정할 권한이 없습니다.");return }
            editManual(m,title);return
        }
        val labels=trips.map { t ->
            val returned=if(!t.has("returned") || t.isNull("returned")) "반납 전" else "반납 ${clean(t,"returned")}m"
            "${clean(t,"label").ifBlank { "필름 롤" }} · 반출 ${display(clean(t,"issued"))}m · $returned"
        }
        AlertDialog.Builder(activity).setTitle("$title · 롤 선택").setItems(labels.toTypedArray()) { _,index ->
            val trip=trips[index];val returned=trip.has("returned") && !trip.isNull("returned")
            val permitted=if(returned) stock.optBoolean("canEdit",false) else stock.optBoolean("canReturnRoll",stock.optBoolean("canEdit",false))
            if(!valid()) return@setItems
            if(!permitted) { toast("이 롤의 반납 기록을 변경할 권한이 없습니다.");return@setItems }
            editRoll(title,trip,returned)
        }.setNegativeButton("닫기",null).show()
    }

    private fun amountField(label:String,value:String):EditText=EditText(activity).apply {
        hint=label;inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        filters=arrayOf(InputFilter.LengthFilter(12));setText(value)
    }
    private fun form():LinearLayout=LinearLayout(activity).apply { orientation=LinearLayout.VERTICAL;setPadding(30,8,30,8) }

    private fun editManual(m:JSONObject,title:String) {
        val previousIssued=clean(m,"issued");val issued=number(previousIssued) ?: run { toast("기존 반출량을 확인하지 못했습니다.");return }
        val f=form();val out=amountField("총 반출량",previousIssued);val back=amountField("반납량",clean(m,"returned"));f.addView(out);f.addView(back)
        val dialog=AlertDialog.Builder(activity).setTitle("$title · 반출·반납")
            .setMessage("롤로 관리하지 않는 자재의 총 반출량과 남은 반납량을 입력합니다. 사용량은 자동 계산됩니다.")
            .setView(f).setNegativeButton("취소",null).setPositiveButton("내용 확인",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid()) return@setOnClickListener
            val outgoing=number(out.text.toString().trim());val returned=number(back.text.toString().trim())
            if(outgoing==null || returned==null || returned>outgoing) { toast("반출·반납량을 확인해 주세요. 반납량은 반출량 이하여야 합니다.");return@setOnClickListener }
            val id=clean(m,"id");if(!id.matches(Regex("^[0-9a-fA-F-]{36}$"))) { toast("자재 정보를 확인하지 못했습니다.");return@setOnClickListener }
            val body=JSONObject().put("action","settle").put("siteId",siteId).put("materialId",id).put("outgoing",outgoing.toPlainString())
                .put("returned",returned.toPlainString()).put("expectedIssued",issued.toPlainString())
                .put("returnUpdatedAt",if(m.has("returnUpdatedAt") && !m.isNull("returnUpdatedAt")) m.get("returnUpdatedAt") else JSONObject.NULL)
                .put("requestId",UUID.randomUUID().toString())
            confirm("$title\n반출 ${outgoing.toPlainString()} · 반납 ${returned.toPlainString()} · 사용 ${outgoing.subtract(returned).toPlainString()} ${clean(m,"unit")}","manual",body) { dialog.dismiss() }
        } };dialog.show()
    }

    private fun editRoll(title:String,t:JSONObject,returned:Boolean) {
        val issued=number(clean(t,"issued")) ?: run { toast("롤의 반출량을 확인하지 못했습니다.");return }
        val rollId=clean(t,"roll_id");val tripId=clean(t,"id")
        if(!rollId.matches(Regex("^[0-9a-fA-F-]{36}$")) || !tripId.matches(Regex("^[0-9a-fA-F-]{36}$")) || !t.has("revision") || t.isNull("revision") || t.optInt("revision",-1)<0) { toast("롤 정보를 확인하지 못했습니다.");return }
        val input=amountField("남은 길이 (m)",if(returned) clean(t,"returned") else "")
        val dialog=AlertDialog.Builder(activity).setTitle("$title · ${clean(t,"label")}")
            .setMessage("반출 ${issued.toPlainString()}m · 남은 길이를 입력하세요. 0이면 전량 사용입니다.")
            .setView(input).setNegativeButton("취소",null).setPositiveButton("내용 확인",null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if(!valid()) return@setOnClickListener
            val remaining=number(input.text.toString().trim())
            if(remaining==null || remaining>issued) { toast("남은 길이는 0 이상 반출 길이 이하여야 합니다.");return@setOnClickListener }
            val body=JSONObject().put("action",if(returned) "correct_return" else "return").put("siteId",siteId).put("rollId",rollId)
                .put("tripId",tripId).put("revision",t.getInt("revision")).put("remaining",remaining.toPlainString()).put("requestId",UUID.randomUUID().toString())
            if(returned) body.put("expectedReturned",clean(t,"returned")) else body.put("location","창고")
            confirm("$title · ${clean(t,"label")}\n반출 ${issued.toPlainString()}m · 반납 ${remaining.toPlainString()}m · 사용 ${issued.subtract(remaining).toPlainString()}m\n\n반납량은 창고 재고에도 반영됩니다.","roll",body) { dialog.dismiss() }
        } };dialog.show()
    }

    private fun confirm(summary:String,type:String,body:JSONObject,onAccepted:()->Unit) {
        AlertDialog.Builder(activity).setTitle("자재 저장 내용 확인").setMessage(summary).setNegativeButton("돌아가기",null)
            .setPositiveButton("확인 후 저장") { _,_ ->
                if(!valid() || busy) return@setPositiveButton
                if(pending()!=null) { toast("이전 자재 저장 결과를 먼저 확인해 주세요.");return@setPositiveButton }
                val record=JSONObject().put("user",uid).put("company",company.id).put("siteId",siteId).put("type",type).put("summary",summary).put("body",body)
                if(!prefs.edit().putString(pendingKey,record.toString()).commit()) { toast("저장 요청을 보관하지 못했습니다.");return@setPositiveButton }
                onAccepted();runPending(record)
            }.show()
    }

    private fun showPending(record:JSONObject) {
        if(record.optString("user")!=uid || record.optString("company")!=company.id || record.optString("siteId")!=siteId) {
            toast("이전 자재 저장을 시작한 계정과 현장에서 결과를 먼저 확인해 주세요.");return
        }
        AlertDialog.Builder(activity).setTitle("이전 자재 저장 확인")
            .setMessage(record.optString("summary")+"\n\n이전 요청의 저장 결과가 확인되지 않았습니다. 같은 요청으로 다시 확인합니다.")
            .setNegativeButton("닫기",null).setNeutralButton("현재 기록 확인") { _,_ -> reviewPending(record) }
            .setPositiveButton("저장 결과 다시 확인") { _,_ -> runPending(record) }.show()
    }

    private fun reviewPending(record:JSONObject) {
        if(busy || !valid()) return
        val body=record.optJSONObject("body") ?: return
        busy=true
        scope.launch {
            try {
                val support=auth.assistantReportSupport(uid,company.id,siteId)
                val stock=auth.filmStock(uid,company.id,siteId)
                if(!valid()) return@launch
                val info=if(record.optString("type")=="roll") {
                    val trips=stock.getJSONArray("trips")
                    val row=(0 until trips.length()).mapNotNull { trips.optJSONObject(it) }.find { clean(it,"site_id")==siteId && clean(it,"roll_id")==body.optString("rollId") && clean(it,"id")==body.optString("tripId") }
                    if(row==null) "해당 롤의 현재 기록을 찾지 못했습니다." else "현재 롤 반출 ${display(clean(row,"issued"))}m · 반납 ${display(clean(row,"returned"))}m"
                } else {
                    val materials=support.getJSONObject("operations").getJSONArray("materials")
                    val row=(0 until materials.length()).mapNotNull { materials.optJSONObject(it) }.find { clean(it,"id")==body.optString("materialId") }
                    if(row==null) "해당 자재의 현재 기록을 찾지 못했습니다." else "현재 자재 반출 ${display(clean(row,"issued"))} · 반납 ${display(clean(row,"returned"))} ${clean(row,"unit")}"
                }
                AlertDialog.Builder(activity).setTitle("현재 저장된 자재 기록")
                    .setMessage(info+"\n\n이전 요청 내용:\n"+record.optString("summary")+"\n\n확인 후 이전 요청을 닫으면 다시 보낼 수 없습니다. 저장 여부가 불확실하면 닫지 말고 다시 확인해 주세요.")
                    .setNegativeButton("요청 유지",null).setPositiveButton("확인 후 요청 닫기") { _,_ ->
                        if(valid() && pending()?.optJSONObject("body")?.optString("requestId")==body.optString("requestId") && prefs.edit().remove(pendingKey).commit()) open()
                    }.show()
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) toast(e.message ?: "현재 자재 기록을 확인하지 못했습니다.") }
            finally { busy=false }
        }
    }

    private fun runPending(record:JSONObject) {
        if(busy || !valid() || record.optString("user")!=uid || record.optString("company")!=company.id || record.optString("siteId")!=siteId) return
        val body=record.optJSONObject("body") ?: run { toast("이전 저장 요청을 확인하지 못했습니다.");return }
        busy=true
        scope.launch {
            var reopen=false
            try {
                when(record.optString("type")) {
                    "manual" -> auth.settleReportMaterial(uid,company.id,siteId,body)
                    "roll" -> auth.filmStock(uid,company.id,siteId,body)
                    else -> error("저장 요청을 확인하지 못했습니다.")
                }
                if(!valid()) return@launch
                check(pending()?.optJSONObject("body")?.optString("requestId")==body.optString("requestId") && prefs.edit().remove(pendingKey).commit()) { "저장 결과는 받았지만 휴대전화 상태를 정리하지 못했습니다. 다시 확인해 주세요." }
                toast("자재 내역을 저장했습니다. 완료보고에서 다시 확인해 주세요.")
                reopen=true
            } catch(e:CancellationException) { throw e }
              catch(e:Exception) { if(valid()) AlertDialog.Builder(activity).setTitle("자재 저장 결과 확인 필요")
                  .setMessage((e.message ?: "저장 결과를 확인하지 못했습니다.")+"\n\n중복 변경을 막기 위해 이전 요청을 보관했습니다. 다시 확인해 주세요.")
                  .setPositiveButton("확인",null).show() }
            finally { busy=false;if(reopen && valid()) open() }
        }
    }
}
