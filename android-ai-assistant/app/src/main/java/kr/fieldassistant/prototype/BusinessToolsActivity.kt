package kr.fieldassistant.prototype

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import android.widget.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.util.UUID

class BusinessToolsActivity:Activity() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
    private val auth by lazy { AccountAuth.shared(this) }
    private val uid get()=intent.getStringExtra("user").orEmpty()
    private val company get()=intent.getStringExtra("company").orEmpty()
    private val follow get()=intent.getStringExtra("mode")=="follow-ups"
    private lateinit var content:LinearLayout
    private var busy=false
    private var taskNumber=0
    private var date=ScheduleDates.today()
    private var offset=0
    private var query=""
    private var page=0
    private fun valid()=!isFinishing&&!isDestroyed&&getSharedPreferences("assistant_user_$uid",MODE_PRIVATE).getString("selected_company",null)==company
    private fun notice(s:String){if(valid())Toast.makeText(this,s,Toast.LENGTH_LONG).show()}
    override fun onCreate(saved:Bundle?){
        super.onCreate(saved)
        if(uid.isBlank()||company.isBlank()){finish();return}
        val root=LinearLayout(this).apply { orientation=1;setBackgroundColor(0xfff5f8f5.toInt());setOnApplyWindowInsetsListener { v,i->val a=i.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.ime());v.setPadding(a.left,a.top,a.right,a.bottom);android.view.WindowInsets.CONSUMED } }
        window.setDecorFitsSystemWindows(false);window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        root.addView(Button(this).apply{text="‹ 업무로 돌아가기";setOnClickListener{if(!busy)finish()}})
        content=LinearLayout(this).apply{orientation=1;setPadding(24,12,24,24)}
        root.addView(ScrollView(this).apply{addView(content)},LinearLayout.LayoutParams(-1,0,1f));setContentView(root);root.requestApplyInsets();label("불러오는 중…");button("다시 불러오기"){load()};load()
    }
    private fun label(s:String){content.addView(TextView(this).apply{text=s;textSize=17f;setTextColor(0xff193c31.toInt());setPadding(8,20,8,12)})}
    private fun button(s:String,act:()->Unit){content.addView(Button(this).apply{text=s;setOnClickListener{if(valid()&&!busy)act()}})}
    private fun task(run:suspend ()->Unit){if(busy||!valid())return;busy=true;val number=++taskNumber;scope.launch{try{run()}catch(e:CancellationException){throw e}catch(e:Exception){notice(e.message?:"다시 확인해 주세요.")}finally{if(number==taskNumber)busy=false}}}
    private suspend fun api(path:String,body:JSONObject?=null)=auth.businessTools(uid,company,path,body)
    private fun rows(v:JSONObject,key:String):List<JSONObject>{val a=v.optJSONArray(key)?:return emptyList();return (0 until a.length()).mapNotNull{a.optJSONObject(it)}}
    private fun followPath()="/api/admin/consultation-follow-ups?companyId=$company&offset=$offset"
    private fun load(){task { val result=api(if(follow)followPath() else "/api/admin/worker-overview?companyId=$company&date=$date");if(!valid())return@task;content.removeAllViews();label(if(follow)"상담 후속 관리" else "시공자 관리 · $date");button("새로 확인"){load()};if(follow)renderFollow(result) else renderWorkers(result) }}
    private fun renderFollow(result:JSONObject){
        label("앱과 웹에 함께 저장합니다. 구글 캘린더에는 추가하지 않습니다. 기존 휴대폰 상담은 대화의 ‘상담 진행 관리’에서 저장해 주세요.")
        button("상담 추가"){edit(JSONObject().put("id",UUID.randomUUID().toString()).put("revision",0).put("stage","draft").put("action","estimate"))}
        val items=rows(result,"items");if(items.isEmpty())label("저장된 상담이 없습니다.")
        items.forEach { r->button(r.optString("title")+"\n"+ConsultationFollowUp.stages[r.optString("stage")]+" · "+ConsultationFollowUp.actions[r.optString("action")]+"\n연락일: "+r.optString("due_date").takeUnless{it=="null"}.orEmpty().ifBlank{"미지정"}){edit(r)} }
        if(offset>0)button("이전 페이지"){offset-=100;load()};if(items.size==100)button("다음 페이지"){offset+=100;load()}
    }
    private fun edit(row:JSONObject){
        val form=LinearLayout(this).apply{orientation=1;setPadding(24,12,24,12)}
        fun input(h:String,v:String)=EditText(this).apply{hint=h;setText(v);setSingleLine();form.addView(this)}
        val title=input("상담 이름",row.optString("title"));title.filters=arrayOf(android.text.InputFilter.LengthFilter(200))
        val dateInput=input("연락일 YYYY-MM-DD · 선택",row.optString("due_date").takeUnless{it=="null"}.orEmpty())
        fun choice(options:Map<String,String>,value:String)=Spinner(this).apply{adapter=ArrayAdapter(this@BusinessToolsActivity,android.R.layout.simple_spinner_dropdown_item,options.values.toList());setSelection(options.keys.indexOf(value).coerceAtLeast(0));form.addView(this)}
        val stage=choice(ConsultationFollowUp.stages,row.optString("stage"));val action=choice(ConsultationFollowUp.actions,row.optString("action"))
        val dialog=AlertDialog.Builder(this).setTitle("상담 진행 수정").setView(form).setNegativeButton("닫기",null).setPositiveButton("저장",null).create()
        dialog.setOnShowListener { dialog.getButton(-1).setOnClickListener {
            val normalized=try{ConsultationFollowUp.normalizedDate(dateInput.text.toString())}catch(e:Exception){dateInput.error=e.message;return@setOnClickListener}
            if(title.text.isBlank()){title.error="상담 이름을 입력해 주세요.";return@setOnClickListener}
            val body=JSONObject().put("id",row.getString("id")).put("revision",row.getInt("revision")).put("companyId",company).put("title",title.text.toString().trim()).put("date",normalized).put("stage",ConsultationFollowUp.stages.keys.elementAt(stage.selectedItemPosition)).put("action",ConsultationFollowUp.actions.keys.elementAt(action.selectedItemPosition))
            task { api(followPath(),body);if(valid()){dialog.dismiss();notice("상담 진행을 저장했습니다.");busy=false;load()} }
        } };dialog.show()
    }
    private fun renderWorkers(result:JSONObject){
        label("표시 날짜의 우리 업체 배정 기준입니다. 다른 업체 일정과 개인 휴무는 시공자에게 확인해 주세요.")
        button("조회 날짜 변경"){val input=EditText(this).apply{setText(date);hint="YYYY-MM-DD"};AlertDialog.Builder(this).setTitle("배정 조회 날짜").setView(input).setPositiveButton("확인"){_,_->val value=input.text.toString();if(ConsultationFollowUp.validDate(value)){date=value;load()}else notice("날짜를 확인해 주세요.")}.setNegativeButton("취소",null).show()}
        button("공개 시공자 찾기 · 연결 요청"){searchForm()}
        button("보낸 연결 요청 확인"){sent()}
        val workers=rows(result,"workers");val relations=rows(result,"relationships");val assignments=rows(result,"assignments")
        if(workers.isEmpty())label("등록된 시공자가 없습니다.")
        workers.forEach{w->val type=relations.find{it.optString("worker_id")==w.optString("id")}?.optString("relationship_type");val count=assignments.count{it.optString("worker_id")==w.optString("id")};label(w.optString("name")+" · "+when(type){"employee"->"직원";"freelancer"->"프리랜서";else->"연결 미등록"}+"\n"+if(!w.optBoolean("is_active",true))"비활성" else if(count>0)"이 날짜 배정 ${count}건" else "이 날짜 우리 업체 배정 없음")}
    }
    private fun searchForm(){val input=EditText(this).apply{hint="이름 · 빈칸이면 전체";setText(query);filters=arrayOf(android.text.InputFilter.LengthFilter(60))};AlertDialog.Builder(this).setTitle("공개 시공자 검색").setView(input).setPositiveButton("검색"){_,_->query=input.text.toString();page=0;search()}.setNegativeButton("취소",null).show()}
    private fun search(){task {val result=api("/api/worker-directory?mode=search&query="+java.net.URLEncoder.encode(query,"UTF-8")+"&page=$page");if(!valid())return@task;content.removeAllViews();label("공개 시공자 · ${page+1}페이지");button("내 시공자 목록"){load()};button("검색 조건 변경"){searchForm()};val profiles=rows(result,"profiles");if(profiles.isEmpty())label("검색 결과가 없습니다.");profiles.forEach{r->label(r.optString("name")+" · "+r.optString("region")+"\n경력 "+r.optInt("experience_years")+"년");when{r.optBoolean("connected")->label("이미 연결된 시공자");r.optString("request_status")=="pending"->label("연결 수락 대기 중");else->button("${r.optString("name")} · 연결 요청"){request(r)}}};if(page>0)button("이전"){page--;search()};if(result.optBoolean("hasMore"))button("다음"){page++;search()} }}
    private fun request(r:JSONObject){AlertDialog.Builder(this).setTitle("${r.optString("name")} 연결 유형").setItems(arrayOf("직원","프리랜서")){_,index->AlertDialog.Builder(this).setTitle("연결 요청 보내기").setMessage("${r.optString("name")}님에게 ${if(index==0)"직원" else "프리랜서"} 연결 요청을 보냅니다. 상대방이 수락하면 연결됩니다.").setPositiveButton("요청 보내기"){_,_->task{api("/api/worker-directory",JSONObject().put("action","request").put("target",r.getString("user_id")).put("relationshipType",if(index==0)"employee" else "freelancer").put("message",""));notice("연결 요청을 보냈습니다.");busy=false;search()}}.setNegativeButton("취소",null).show()}.setNegativeButton("닫기",null).show()}
    private fun sent(){task{val result=api("/api/worker-directory?mode=sent");if(!valid())return@task;content.removeAllViews();label("보낸 연결 요청");button("내 시공자 목록"){load()};val requests=rows(result,"requests");if(requests.isEmpty())label("보낸 요청이 없습니다.");requests.forEach{r->label(r.optString("name")+" · "+when(r.optString("status")){"pending"->"수락 대기";"accepted"->"수락됨";"declined"->"거절됨";"cancelled"->"취소됨";else->"종료됨"});if(r.optString("status")=="pending")button("요청 취소"){AlertDialog.Builder(this).setTitle("${r.optString("name")} 연결 요청 취소").setPositiveButton("취소하기"){_,_->task{api("/api/worker-directory",JSONObject().put("action","cancel").put("id",r.getString("id")).put("revision",r.getInt("revision")));busy=false;sent()}}.setNegativeButton("돌아가기",null).show()}}}}
    override fun onDestroy(){scope.cancel();super.onDestroy()}
}
