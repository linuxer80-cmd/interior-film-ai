package kr.fieldassistant.prototype

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.LocationManager
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.widget.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.time.YearMonth

/** Uses the existing authenticated attendance API; no continuous location tracking. */
class AttendanceActivity : Activity() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
    private val auth by lazy { AccountAuth.shared(this) }
    private val uid get()=intent.getStringExtra("user").orEmpty()
    private val company get()=intent.getStringExtra("company").orEmpty()
    private var month=YearMonth.parse(ScheduleDates.today().take(7))
    private var data:JSONObject?=null
    private var busy=false
    private var gpsCapturedAt=0L
    private var locationCancel:CancellationSignal?=null
    private var permissionAction:(()->Unit)?=null
    private val handler=Handler(Looper.getMainLooper())
    private lateinit var content:LinearLayout
    private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
    private fun valid()=!isFinishing && !isDestroyed && getSharedPreferences("assistant_user_$uid",MODE_PRIVATE).getString("selected_company",null)==company
    private fun notice(value:String) { if(!isFinishing && !isDestroyed) Toast.makeText(this,value,Toast.LENGTH_LONG).show() }
    override fun onCreate(saved:Bundle?) {
        super.onCreate(saved)
        if(uid.isBlank() || company.isBlank()) { finish();return }
        window.setDecorFitsSystemWindows(false)
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        val page=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(248,250,248))
            setOnApplyWindowInsetsListener { v,i -> val a=i.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout() or android.view.WindowInsets.Type.ime());v.setPadding(a.left,a.top,a.right,a.bottom);android.view.WindowInsets.CONSUMED }
        }
        page.addView(Button(this).apply { text="‹ 업무로 돌아가기";setOnClickListener { if(busy) notice("진행 중인 처리를 기다려 주세요.") else finish() } })
        content=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(8),dp(16),dp(20)) }
        page.addView(ScrollView(this).apply { addView(content) },LinearLayout.LayoutParams(-1,0,1f));setContentView(page);page.requestApplyInsets()
        load()
    }
    private fun label(value:String,size:Float=15f)=TextView(this).apply { text=value;textSize=size;setTextColor(Color.rgb(29,60,44));setPadding(0,dp(8),0,dp(8)) }
    private fun button(value:String,run:()->Unit) { content.addView(Button(this).apply { text=value;isEnabled=!busy;setOnClickListener { if(valid() && !busy) run() else notice("계정 또는 진행 상태를 확인해 주세요.") } }) }
    private fun render() {
        content.removeAllViews();content.addView(label(intent.getStringExtra("company_name").orEmpty()+" · 내 출퇴근",21f))
        content.addView(label("$month · 한국 시간 기준"))
        if(busy) content.addView(label("처리 중입니다…"))
        val current=data
        button("새로 확인") { load() }
        button("조회 월 변경") {
            val choices=arrayOf("이전 달","이번 달","다음 달")
            AlertDialog.Builder(this).setTitle("조회 월").setItems(choices) { _,i ->
                val next=when(i) { 0->month.minusMonths(1);1->YearMonth.parse(ScheduleDates.today().take(7));else->month.plusMonths(1) }
                if(next.year !in 2000..2099) return@setItems
                month=next;load()
            }.setNegativeButton("취소",null).show()
        }
        if(current==null) { content.addView(label("출퇴근 기록을 불러온 후 사용할 수 있습니다."));return }
        val records=AttendanceModel.rows(current,"records");val sites=AttendanceModel.rows(current,"sites")
        fun name(id:String)=sites.find { it.optString("id")==id }?.optString("site_name").orEmpty().ifBlank { "현장" }
        val active=records.filter(AttendanceModel::open)
        if(active.isNotEmpty()) {
            content.addView(label("퇴근하지 않은 기록 ${active.size}건",18f))
            active.forEach { r -> button(name(r.optString("site_id"))+" · 퇴근 기록\n출근 "+AttendanceModel.time(r.optString("clock_in"))) {
                prepare(JSONObject().put("action","out").put("id",r.optString("id")),name(r.optString("site_id")))
            } }
        } else {
            val eligible=sites.filter { it.optBoolean("canClockIn") }
            content.addView(label("오늘 출근할 현장",18f))
            if(eligible.isEmpty()) content.addView(label("오늘 출근 가능한 배정 현장이 없습니다."))
            eligible.forEach { s -> button(name(s.optString("id"))+" · 출근 기록") { prepare(JSONObject().put("action","in").put("siteId",s.optString("id")),name(s.optString("id"))) } }
        }
        content.addView(label("내 출퇴근 내역 ${records.size}건",18f))
        if(records.isEmpty()) content.addView(label("이 달의 기록이 없습니다."))
        records.take(100).forEach { r ->
            val status=when(r.optString("review_status")) { "approved"->"승인";"rejected"->"반려";else->"관리자 확인 대기" }
            content.addView(label(name(r.optString("site_id"))+"\n출근 ${AttendanceModel.time(r.optString("clock_in"))} · 퇴근 ${if(AttendanceModel.open(r)) "근무 중" else AttendanceModel.time(r.optString("clock_out"))}\n$status"))
        }
        if(records.size>100) content.addView(label("최근 100건을 표시합니다."))
        content.addView(label("이전 달에 출근한 미퇴근 기록도 함께 표시됩니다. 관리자 승인·근무 기준 설정은 기존 관리 화면에서 처리합니다."))
    }
    private fun load() {
        if(busy || !valid()) return
        busy=true;data=null;render()
        scope.launch {
            try { val result=auth.attendance(uid,company,month.toString());if(valid()) data=result }
            catch(e:CancellationException) { throw e }
            catch(e:Exception) { notice(e.message ?: "출퇴근 기록을 확인하지 못했습니다.") }
            finally { busy=false;if(valid()) render() }
        }
    }
    private fun prepare(body:JSONObject,name:String) {
        val form=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(8),dp(20),dp(12)) }
        form.addView(label("버튼을 누를 때만 현재 위치와 서버 시간을 기록합니다. 본인과 소속 관리자가 근무·연장비용 확인에 사용하며 계속 위치를 추적하지 않습니다."))
        val consent=CheckBox(this).apply { text="위치 기록 안내를 확인했습니다." };form.addView(consent)
        val reason=EditText(this).apply { hint="GPS를 사용할 수 없는 사유 (3자 이상)";filters=arrayOf(android.text.InputFilter.LengthFilter(300)) };form.addView(reason)
        val dialog=AlertDialog.Builder(this).setTitle(name+" · "+if(body.optString("action")=="in") "출근" else "퇴근")
            .setView(form).setPositiveButton("현재 위치 확인",null).setNeutralButton("사유와 시간만 기록",null).setNegativeButton("취소",null).create()
        dialog.setOnShowListener {
            fun ready()=valid() && !busy && consent.isChecked
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                if(!ready()) { notice("위치 기록 안내를 확인해 주세요.");return@setOnClickListener }
                body.put("consent",true);dialog.dismiss()
                val action={ locate(body,name) }
                if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) action()
                else { permissionAction=action;requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),601) }
            }
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
                if(!ready()) { notice("위치 기록 안내를 확인해 주세요.");return@setOnClickListener }
                if(reason.text.toString().trim().length<3) { reason.error="3자 이상 입력해 주세요.";return@setOnClickListener }
                body.put("consent",true).put("reason",reason.text.toString().trim()).put("gps",JSONObject.NULL)
                dialog.dismiss();confirm(body,name,"위치 미확인 · 사유: "+reason.text.toString().trim())
            }
        };dialog.show()
    }
    private fun locate(body:JSONObject,name:String) {
        if(!valid() || busy) return
        busy=true;render()
        val cancel=CancellationSignal();locationCancel=cancel
        var finished=false
        fun finish(gps:JSONObject?) {
            if(finished) return;finished=true;cancel.cancel();locationCancel=null;busy=false
            if(!valid()) return
            render()
            if(gps==null) { notice("현재 위치를 확인하지 못했습니다. GPS를 켜고 다시 시도하거나 사유를 입력해 주세요.");prepare(body,name) }
            else { gpsCapturedAt=SystemClock.elapsedRealtime();body.put("gps",gps);confirm(body,name,"현재 위치 확인 · 오차 ±${gps.optDouble("accuracy").toInt()}m") }
        }
        handler.postDelayed({ finish(null) },15000)
        try {
            val manager=getSystemService(LOCATION_SERVICE) as LocationManager
            val provider=if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
            manager.getCurrentLocation(provider,cancel,mainExecutor) { location ->
                val gps=location?.takeIf { it.hasAccuracy() && AttendanceModel.validGps(it.latitude,it.longitude,it.accuracy.toDouble(),(SystemClock.elapsedRealtimeNanos()-it.elapsedRealtimeNanos)/1000000) }
                    ?.let { JSONObject().put("latitude",it.latitude).put("longitude",it.longitude).put("accuracy",it.accuracy.toDouble()) }
                finish(gps)
            }
        } catch(_:Exception) { finish(null) }
    }
    private fun confirm(body:JSONObject,name:String,gpsLabel:String) {
        if(!valid()) return
        AlertDialog.Builder(this).setTitle(if(body.optString("action")=="in") "출근 기록 저장" else "퇴근 기록 저장")
            .setMessage("$name\n$gpsLabel\n\n저장 시점의 서버 시간이 기록됩니다.")
            .setPositiveButton("저장") { _,_ -> save(body) }.setNegativeButton("취소",null).show()
    }
    private fun save(body:JSONObject) {
        if(busy || !valid()) return
        if(!body.isNull("gps") && SystemClock.elapsedRealtime()-gpsCapturedAt>120000) { notice("위치를 확인한 지 오래됐습니다. 출퇴근 버튼을 눌러 다시 확인해 주세요.");return }
        busy=true;render()
        scope.launch {
            try { val result=auth.attendance(uid,company,ScheduleDates.today().take(7),body);if(valid()) notice(result.optString("message").ifBlank { "저장했습니다." }) }
            catch(e:CancellationException) { throw e }
            catch(e:Exception) { if(valid()) AlertDialog.Builder(this@AttendanceActivity).setTitle("저장 결과 확인 필요").setMessage((e.message ?: "연결을 확인해 주세요.")+"\n\n자동 재전송하지 않습니다. 새로 불러온 기록을 먼저 확인해 주세요.").setPositiveButton("확인",null).show() }
            finally { busy=false;if(valid()) { month=YearMonth.parse(ScheduleDates.today().take(7));load() } }
        }
    }
    override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,results:IntArray) {
        super.onRequestPermissionsResult(code,permissions,results)
        if(code!=601) return
        val action=permissionAction;permissionAction=null
        if(results.any { it==PackageManager.PERMISSION_GRANTED } && valid()) action?.invoke()
        else notice("위치 권한이 없습니다. 출퇴근 버튼을 다시 눌러 사유와 시간만 기록할 수 있습니다.")
    }
    override fun onDestroy() { permissionAction=null;locationCancel?.cancel();handler.removeCallbacksAndMessages(null);scope.cancel();super.onDestroy() }
}
