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
    private val ui by lazy { BusinessUi(this) }
    private lateinit var progress:ProgressBar
    private var followFilter="active"
    private var workerFilter="all"
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
        if(intent.getStringExtra("filter")=="due")followFilter="due"
        if(uid.isBlank()||company.isBlank()){finish();return}
        val root=LinearLayout(this).apply { orientation=1;setBackgroundColor(ui.canvas);setOnApplyWindowInsetsListener { v,i->val a=i.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout() or android.view.WindowInsets.Type.ime());v.setPadding(a.left,a.top,a.right,a.bottom);android.view.WindowInsets.CONSUMED } }
        window.setDecorFitsSystemWindows(false);window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        root.addView(ui.button("‹ 업무").apply { setOnClickListener { if(!busy)finish() else notice("처리 중입니다. 잠시만 기다려 주세요.") } },LinearLayout.LayoutParams(-1,-2).apply { setMargins(ui.dp(16),ui.dp(8),ui.dp(16),ui.dp(8)) })
        progress=ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal).apply { isIndeterminate=true;visibility=android.view.View.GONE }
        root.addView(progress,LinearLayout.LayoutParams(-1,ui.dp(3)))
        content=LinearLayout(this).apply{orientation=1;setPadding(ui.dp(18),ui.dp(12),ui.dp(18),ui.dp(24))}
        root.addView(ScrollView(this).apply{addView(content)},LinearLayout.LayoutParams(-1,0,1f));setContentView(root);root.requestApplyInsets();label("불러오는 중…");button("다시 불러오기"){load()};load()
    }
    private fun label(s:String){content.addView(ui.text(s,color=ui.muted),LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=ui.dp(14) })}
    private fun button(s:String,primary:Boolean=false,parent:LinearLayout=content,act:()->Unit){parent.addView(ui.button(s,primary).apply { setOnClickListener { if(valid()&&!busy)act() else if(busy)notice("처리 중입니다. 잠시만 기다려 주세요.") } },LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=ui.dp(10) })}
    private fun task(run:suspend ()->Unit){if(busy||!valid())return;busy=true;progress.visibility=android.view.View.VISIBLE;val number=++taskNumber;scope.launch{try{run()}catch(e:CancellationException){throw e}catch(e:Exception){notice(e.message?:"다시 확인해 주세요.")}finally{if(number==taskNumber){busy=false;progress.visibility=android.view.View.GONE}}}}
    private fun filters(values:List<Pair<String,String>>,selected:String,choose:(String)->Unit){
        val row=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL }
        values.forEach { (key,title)->row.addView(ui.button(title,key==selected).apply { contentDescription=title+if(key==selected)" · 선택됨" else "";setOnClickListener { if(!busy)choose(key) } },LinearLayout.LayoutParams(-2,-2).apply { marginEnd=ui.dp(8) }) }
        content.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled=false;addView(row) },LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=ui.dp(16) })
    }
    private fun empty(title:String,detail:String){val box=ui.card(content);box.addView(ui.text(title,18f,true));box.addView(ui.text(detail,color=ui.muted),LinearLayout.LayoutParams(-1,-2).apply { topMargin=ui.dp(8) })}
    private fun selectDate(value:String,selected:(String)->Unit){
        val day=runCatching { java.time.LocalDate.parse(value) }.getOrDefault(java.time.LocalDate.parse(ScheduleDates.today()))
        android.app.DatePickerDialog(this,{_,y,m,d->selected(java.time.LocalDate.of(y,m+1,d).toString())},day.year,day.monthValue-1,day.dayOfMonth).apply {
            datePicker.minDate=java.time.LocalDate.of(2000,1,1).atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
            datePicker.maxDate=java.time.LocalDate.of(2099,12,31).atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        }.show()
    }
    private suspend fun api(path:String,body:JSONObject?=null)=auth.businessTools(uid,company,path,body)
    private fun rows(v:JSONObject,key:String):List<JSONObject>{val a=v.optJSONArray(key)?:return emptyList();return (0 until a.length()).mapNotNull{a.optJSONObject(it)}}
    private fun followPath()="/api/admin/consultation-follow-ups?companyId=$company&offset=$offset"+(if(followFilter=="due") "&due="+ScheduleDates.today() else "")
    private fun load(){task { val result=api(if(follow)followPath() else "/api/admin/worker-overview?companyId=$company&date=$date");if(!valid())return@task;content.removeAllViews();ui.heading(content,if(follow)"상담 후속 관리" else "시공자 관리",if(follow)"다음 연락과 견적 진행을 한곳에서" else "함께하는 시공자와 날짜별 배정 현황");if(follow)renderFollow(result) else renderWorkers(result) }}
    private fun renderFollow(result:JSONObject){
        val items=rows(result,"items");val today=ScheduleDates.today()
        val due=items.count { it.optString("stage")!="closed" && it.optString("due_date")!="null" && it.optString("due_date").isNotBlank() && it.optString("due_date")<=today }
        val summary=ui.card(content);ui.badge(summary,"앱 · 웹 동기화")
        summary.addView(ui.text("연락할 상담 ${due}건",22f,true));summary.addView(ui.text("현재 페이지 기준 · 오늘까지의 연락 예정일",12f,color=ui.muted))
        button("+ 상담 추가",true){edit(JSONObject().put("id",UUID.randomUUID().toString()).put("revision",0).put("stage","draft").put("action","estimate"))}
        button("새로 확인"){load()}
        filters(listOf("active" to "진행 중","due" to "연락할 상담","all" to "전체"),followFilter) { followFilter=it;offset=0;load() }
        val visible=items.filter { r->when(followFilter){"active"->r.optString("stage")!="closed";"due"->r.optString("stage")!="closed"&&r.optString("due_date").let { it!="null"&&it.isNotBlank()&&it<=today };else->true} }
        if(visible.isEmpty())empty("표시할 상담이 없어요","다른 필터를 선택하거나 새 상담을 추가해 주세요.")
        visible.forEach { r->
            val box=ui.card(content);val date=r.optString("due_date").takeUnless{it=="null"}.orEmpty();val closed=r.optString("stage")=="closed"
            val overdue=!closed&&date.isNotBlank()&&date<today
            ui.badge(box,if(overdue)"연락일 지남" else ConsultationFollowUp.stages[r.optString("stage")]?:"상담",overdue)
            box.addView(ui.text(r.optString("title"),19f,true))
            box.addView(ui.text("다음 할 일  ·  "+ConsultationFollowUp.actions[r.optString("action")],color=ui.muted),LinearLayout.LayoutParams(-1,-2).apply { topMargin=ui.dp(8) })
            box.addView(ui.text(if(date==today)"오늘 연락 예정" else "연락일  ·  "+date.ifBlank{"미지정"},14f,!closed&&date==today),LinearLayout.LayoutParams(-1,-2).apply { topMargin=ui.dp(4);bottomMargin=ui.dp(14) })
            button("진행 수정",parent=box){edit(r)}
            val local=runCatching { org.json.JSONArray(getSharedPreferences("assistant_user_$uid",MODE_PRIVATE).getString("records","[]")) }.getOrDefault(org.json.JSONArray())
            val record=(0 until local.length()).mapNotNull { local.optJSONObject(it) }.find { it.optString("chat_company")==company && it.optString("follow_up_id")==r.optString("id") }
            if(record!=null)button("원래 통화 · 대화 보기",parent=box){openOrigin(record.optString("id"),"")}
            val site=r.optString("site_id").takeUnless{it=="null"}.orEmpty().ifBlank{record?.optString("site_id").orEmpty()}
            if(site.isNotBlank())button("연결 현장 열기",parent=box){openOrigin("",site)}
            else button("연결할 현장 선택",parent=box){connectSite(r)}
        }
        label("구글 캘린더에는 등록하지 않습니다. 기존 휴대폰 상담은 대화의 ‘상담 진행 관리’에서 저장하면 연결됩니다.")
        if(offset>0)button("‹ 이전 페이지"){offset-=100;load()};if(items.size==100)button("다음 페이지 ›"){offset+=100;load()}
    }
    private fun openOrigin(record:String,site:String){
        if(!valid())return
        startActivity(android.content.Intent(this,MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP or android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("follow_origin_user",uid).putExtra("follow_origin_company",company).putExtra("follow_origin_record",record).putExtra("follow_origin_site",site))
        finish()
    }
    private fun connectSite(row:JSONObject){task {
        val all=auth.assistantSites(uid,company);if(!valid())return@task
        val sites=(0 until all.length()).mapNotNull{all.optJSONObject(it)}
        val form=LinearLayout(this).apply{orientation=1;setPadding(ui.dp(16),ui.dp(8),ui.dp(16),ui.dp(8))}
        val input=EditText(this).apply{hint="현장명 · 주소 검색";setSingleLine()};form.addView(input)
        val list=LinearLayout(this).apply{orientation=1};form.addView(ScrollView(this).apply{addView(list)},LinearLayout.LayoutParams(-1,ui.dp(300)))
        val dialog=AlertDialog.Builder(this).setTitle("연결할 현장 선택").setView(form).setNegativeButton("닫기",null).create()
        fun show(){list.removeAllViews();val q=input.text.toString().trim();val matches=sites.filter{it.optString("site_name").contains(q,true)||it.optString("address").contains(q,true)}
            list.addView(ui.text("${matches.size}건 · 최대 30건 표시"));matches.take(30).forEach { site->button(site.optString("site_name")+" · "+site.optString("address"),parent=list){
                AlertDialog.Builder(this).setTitle("현장 연결 확인").setMessage(row.optString("title")+" 상담을 "+site.optString("site_name")+" 현장에 연결할까요?")
                    .setPositiveButton("연결"){_,_->task {
                        val body=JSONObject().put("id",row.getString("id")).put("revision",row.getInt("revision")).put("companyId",company).put("title",row.getString("title")).put("stage",row.getString("stage")).put("action",row.getString("action")).put("date",row.optString("due_date").takeUnless{it=="null"}.orEmpty()).put("siteId",site.getString("id"))
                        api(followPath(),body);if(valid()){dialog.dismiss();notice("현장을 연결했습니다.");busy=false;load()}
                    }}.setNegativeButton("취소",null).show()
            }}
        }
        input.addTextChangedListener(object:android.text.TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){show()};override fun afterTextChanged(s:android.text.Editable?){} });show();dialog.show()
    }}
    private fun edit(row:JSONObject){
        val form=LinearLayout(this).apply{orientation=1;setPadding(24,12,24,12)}
        fun input(h:String,v:String):EditText { form.addView(ui.text(h,13f,true),LinearLayout.LayoutParams(-1,-2).apply { topMargin=ui.dp(12) });return EditText(this).apply{hint=h;setText(v);setSingleLine();minHeight=ui.dp(48);form.addView(this)} }
        val title=input("상담 이름",row.optString("title"));title.filters=arrayOf(android.text.InputFilter.LengthFilter(200))
        val dateInput=input("연락일 YYYY-MM-DD · 선택",row.optString("due_date").takeUnless{it=="null"}.orEmpty())
        form.addView(ui.button("달력에서 연락일 선택").apply { setOnClickListener { selectDate(dateInput.text.toString()) { dateInput.setText(it) } } })
        form.addView(ui.button("연락일 비우기").apply { setOnClickListener { dateInput.setText("") } })
        fun choice(options:Map<String,String>,value:String)=Spinner(this).apply{minimumHeight=ui.dp(48);adapter=ArrayAdapter(this@BusinessToolsActivity,android.R.layout.simple_spinner_dropdown_item,options.values.toList());setSelection(options.keys.indexOf(value).coerceAtLeast(0));form.addView(this)}
        form.addView(ui.text("상담 단계",13f,true));val stage=choice(ConsultationFollowUp.stages,row.optString("stage"));form.addView(ui.text("다음 할 일",13f,true));val action=choice(ConsultationFollowUp.actions,row.optString("action"))
        val dialog=AlertDialog.Builder(this).setTitle("상담 진행 수정").setView(ScrollView(this).apply { addView(form) }).setNegativeButton("닫기",null).setPositiveButton("저장",null).create()
        dialog.setOnShowListener { dialog.getButton(-1).setOnClickListener {
            val normalized=try{ConsultationFollowUp.normalizedDate(dateInput.text.toString())}catch(e:Exception){dateInput.error=e.message;return@setOnClickListener}
            if(title.text.isBlank()){title.error="상담 이름을 입력해 주세요.";return@setOnClickListener}
            val body=JSONObject().put("id",row.getString("id")).put("revision",row.getInt("revision")).put("companyId",company).put("title",title.text.toString().trim()).put("date",normalized).put("stage",ConsultationFollowUp.stages.keys.elementAt(stage.selectedItemPosition)).put("action",ConsultationFollowUp.actions.keys.elementAt(action.selectedItemPosition))
            task { api(followPath(),body);if(valid()){dialog.dismiss();notice("상담 진행을 저장했습니다.");busy=false;load()} }
        } };dialog.show()
    }
    private fun renderWorkers(result:JSONObject){
        val workers=rows(result,"workers");val relations=rows(result,"relationships");val assignments=rows(result,"assignments")
        val box=ui.card(content);ui.badge(box,"우리 업체 배정 기준");box.addView(ui.text(date,22f,true));box.addView(ui.text("등록 ${workers.size}명 · 배정 ${assignments.map{it.optString("worker_id")}.distinct().size}명",color=ui.muted))
        button("날짜 선택",parent=box){selectDate(date){date=it;load()}}
        button("+ 공개 시공자 찾기",true){searchForm()}
        button("보낸 연결 요청"){sent()}
        button("새로 확인"){load()}
        filters(listOf("all" to "전체","employee" to "직원","freelancer" to "프리랜서"),workerFilter){workerFilter=it;content.removeAllViews();ui.heading(content,"시공자 관리","함께하는 시공자와 날짜별 배정 현황");renderWorkers(result)}
        val visible=workers.filter { w->workerFilter=="all"||relations.any{it.optString("worker_id")==w.optString("id")&&it.optString("relationship_type")==workerFilter} }
        if(visible.isEmpty())empty("표시할 시공자가 없어요","다른 유형을 선택하거나 공개 시공자를 찾아 연결해 주세요.")
        visible.forEach { w->
            val type=relations.find{it.optString("worker_id")==w.optString("id")}?.optString("relationship_type")
            val count=assignments.count{it.optString("worker_id")==w.optString("id")}
            val card=ui.card(content);ui.badge(card,when(type){"employee"->"직원";"freelancer"->"프리랜서";else->"연결 미등록"})
            card.addView(ui.text(w.optString("name"),20f,true))
            card.addView(ui.text(if(!w.optBoolean("is_active",true))"비활성" else if(count>0)"배정된 현장 ${count}건" else "우리 업체 배정 없음",color=if(count>0)ui.accent else ui.muted),LinearLayout.LayoutParams(-1,-2).apply{topMargin=ui.dp(8)})
        }
        label("다른 업체 일정과 개인 휴무는 시공자에게 확인해 주세요.")
    }
    private fun searchForm(){val input=EditText(this).apply{hint="이름 · 빈칸이면 전체";setText(query);filters=arrayOf(android.text.InputFilter.LengthFilter(60))};AlertDialog.Builder(this).setTitle("공개 시공자 검색").setView(input).setPositiveButton("검색"){_,_->query=input.text.toString();page=0;search()}.setNegativeButton("취소",null).show()}
    private fun search(){task {val result=api("/api/worker-directory?mode=search&query="+java.net.URLEncoder.encode(query,"UTF-8")+"&page=$page");if(!valid())return@task;content.removeAllViews();label("공개 시공자 · ${page+1}페이지");button("내 시공자 목록"){load()};button("검색 조건 변경"){searchForm()};val profiles=rows(result,"profiles");if(profiles.isEmpty())label("검색 결과가 없습니다.");profiles.forEach{r->label(r.optString("name")+" · "+r.optString("region")+"\n경력 "+r.optInt("experience_years")+"년");when{r.optBoolean("connected")->label("이미 연결된 시공자");r.optString("request_status")=="pending"->label("연결 수락 대기 중");else->button("${r.optString("name")} · 연결 요청"){request(r)}}};if(page>0)button("이전"){page--;search()};if(result.optBoolean("hasMore"))button("다음"){page++;search()} }}
    private fun request(r:JSONObject){AlertDialog.Builder(this).setTitle("${r.optString("name")} 연결 유형").setItems(arrayOf("직원","프리랜서")){_,index->AlertDialog.Builder(this).setTitle("연결 요청 보내기").setMessage("${r.optString("name")}님에게 ${if(index==0)"직원" else "프리랜서"} 연결 요청을 보냅니다. 상대방이 수락하면 연결됩니다.").setPositiveButton("요청 보내기"){_,_->task{api("/api/worker-directory",JSONObject().put("action","request").put("target",r.getString("user_id")).put("relationshipType",if(index==0)"employee" else "freelancer").put("message",""));notice("연결 요청을 보냈습니다.");busy=false;search()}}.setNegativeButton("취소",null).show()}.setNegativeButton("닫기",null).show()}
    private fun sent(){task{val result=api("/api/worker-directory?mode=sent");if(!valid())return@task;content.removeAllViews();label("보낸 연결 요청");button("내 시공자 목록"){load()};val requests=rows(result,"requests");if(requests.isEmpty())label("보낸 요청이 없습니다.");requests.forEach{r->label(r.optString("name")+" · "+when(r.optString("status")){"pending"->"수락 대기";"accepted"->"수락됨";"declined"->"거절됨";"cancelled"->"취소됨";else->"종료됨"});if(r.optString("status")=="pending")button("요청 취소"){AlertDialog.Builder(this).setTitle("${r.optString("name")} 연결 요청 취소").setPositiveButton("취소하기"){_,_->task{api("/api/worker-directory",JSONObject().put("action","cancel").put("id",r.getString("id")).put("revision",r.getInt("revision")));busy=false;sent()}}.setNegativeButton("돌아가기",null).show()}}}}
    override fun onDestroy(){scope.cancel();super.onDestroy()}
}
