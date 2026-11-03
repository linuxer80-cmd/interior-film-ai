package kr.fieldassistant.prototype

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/** Native, accessible result cards. Stored results are snapshots; taps recheck access. */
internal object AssistantResultViews {
    fun render(context: Context, result: JSONObject, onSite: (String)->Unit, workerActions:Boolean=false, ownerActions:Boolean=false, onAction:(String,String)->Unit={ _,_ -> }): View {
        fun dp(n:Int)=(n*context.resources.displayMetrics.density).toInt()
        val ink=Color.rgb(43,62,51)
        val muted=Color.rgb(100,115,106)
        val green=Color.rgb(231,242,233)
        fun label(value:String,size:Float=14f,bold:Boolean=false)=TextView(context).apply {
            text=value;textSize=size;setTextColor(ink);setPadding(dp(10),dp(10),dp(10),dp(10))
            if(bold) setTypeface(typeface,Typeface.BOLD)
        }
        val card=LinearLayout(context).apply {
            orientation=LinearLayout.VERTICAL
            background=GradientDrawable().apply { setColor(Color.WHITE);cornerRadius=dp(16).toFloat();setStroke(dp(1),Color.rgb(218,226,220)) }
            setPadding(dp(6),dp(8),dp(6),dp(8))
        }
        val kind=result.optString("kind")
        val rows=result.optJSONArray("rows") ?: JSONArray()
        val sites=(0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
        card.addView(label(result.optString("title"),18f,true))
        card.addView(label(result.optString("subtitle"),13f).apply { setTextColor(muted) })
        fun table(headers:List<String>, widths:List<Int>, entries:List<Pair<List<String>,String>>, horizontal:Boolean=true) {
            val grid=LinearLayout(context).apply { orientation=LinearLayout.VERTICAL }
            fun addRow(values:List<String>,head:Boolean,index:Int,id:String) {
                val line=LinearLayout(context).apply { orientation=LinearLayout.HORIZONTAL;setBackgroundColor(if(head) green else if(index%2==0) Color.rgb(247,249,247) else Color.WHITE) }
                values.forEachIndexed { i,value ->
                    line.addView(label(value.ifBlank { "—" },if(head) 13f else 14f,head),if(horizontal) LinearLayout.LayoutParams(dp(widths[i]),-2) else LinearLayout.LayoutParams(0,-2,widths[i].toFloat()))
                }
                if(kind=="detail" && !head && result.optString("site_id").isNotBlank() && values.getOrNull(1) !in listOf(null,"","미등록","—")) {
                    val action=when(values.firstOrNull()) { "연락처" -> "phone";"주소" -> "navigate";else -> "" }
                    if(action.isNotBlank()) { (line.getChildAt(1) as? TextView)?.apply { setTextColor(Color.rgb(37,101,79));paintFlags=paintFlags or android.graphics.Paint.UNDERLINE_TEXT_FLAG };line.setOnClickListener { onAction(result.optString("site_id"),action) };line.contentDescription=values.joinToString(" · ")+if(action=="phone") " · 전화 걸기" else " · 길 안내" }
                }
                if(id.isNotBlank()) { line.isClickable=true;line.contentDescription=values.joinToString(" · ")+" · 현장 상세 보기";line.setOnClickListener { onSite(id) } }
                grid.addView(line)
            }
            addRow(headers,true,0,"")
            entries.forEachIndexed { i,row -> addRow(row.first,false,i,row.second) }
            if(horizontal) card.addView(HorizontalScrollView(context).apply { isHorizontalScrollBarEnabled=true;addView(grid) }) else card.addView(grid)
        }
        if(kind=="detail") {
            val fields=result.optJSONArray("fields") ?: JSONArray()
            table(listOf("항목","내용"),listOf(1,3),(0 until fields.length()).mapNotNull { fields.optJSONArray(it) }.map { listOf(it.optString(0),it.optString(1)) to "" },false)
            val siteId=result.optString("site_id")
            if((workerActions || ownerActions) && siteId.isNotBlank()) {
                card.addView(label("이 현장에서 할 일",16f,true))
                val actions=mutableListOf("전화 걸기" to "phone","길 안내" to "navigate")
                if(workerActions || ownerActions) actions.addAll(listOf("필름 사용량 · 자재" to "film","경비 입력" to "expenses","완료보고 작성" to "report"))
                if(workerActions) actions.add("현장 업무 전체" to "info")
                if(ownerActions) actions.addAll(listOf("현장 기본정보 수정" to "info","전체 업무 (웹)" to "all","상담 견적서 작성" to "quote","일정 · 시공자 배정" to "schedule"))
                actions.forEach { (title,section) ->
                    card.addView(Button(context).apply {
                        text=title;textSize=15f;isAllCaps=false;minHeight=dp(48)
                        setTextColor(if(section=="report") Color.WHITE else ink)
                        background=GradientDrawable().apply { setColor(if(section=="report") Color.rgb(48,91,69) else green);cornerRadius=dp(12).toFloat() }
                        setOnClickListener { onAction(siteId,section) }
                    },LinearLayout.LayoutParams(-1,-2).apply { setMargins(dp(6),dp(6),dp(6),dp(4)) })
                }
                card.addView(label("필름 사용량, 경비, 현장 기본정보와 상담 견적서는 앱에서 입력합니다. 완료보고·일정 배정은 필름장이 화면으로 연결됩니다.",12f).apply { setTextColor(muted) })
            }
            return card
        }
        if(kind=="schedule") {
            val from=LocalDate.parse(result.getString("from"))
            val to=LocalDate.parse(result.getString("to"))
            val today=LocalDate.now(ZoneId.of("Asia/Seoul"))
            fun onDate(date:LocalDate)=sites.filter { site ->
                val days=site.optJSONArray("dates") ?: JSONArray()
                (0 until days.length()).any { days.optString(it)==date.toString() }
            }
            var month=YearMonth.from(from)
            val last=YearMonth.from(to)
            while(!month.isAfter(last)) {
                card.addView(label("${month.year}년 ${month.monthValue}월",17f,true))
                val weekdays=LinearLayout(context)
                listOf("일","월","화","수","목","금","토").forEach { weekdays.addView(label(it,12f,true).apply { gravity=Gravity.CENTER;setPadding(0,dp(8),0,dp(8)) },LinearLayout.LayoutParams(0,-2,1f)) }
                card.addView(weekdays)
                val offset=month.atDay(1).dayOfWeek.value%7
                val weeks=(offset+month.lengthOfMonth()+6)/7
                for(week in 0 until weeks) {
                    val line=LinearLayout(context)
                    for(column in 0..6) {
                        val day=week*7+column-offset+1
                        val cell=label("",12f).apply { gravity=Gravity.CENTER;setPadding(0,dp(8),0,dp(8));minHeight=dp(60) }
                        if(day in 1..month.lengthOfMonth()) {
                            val date=month.atDay(day)
                            val inRange=!date.isBefore(from) && !date.isAfter(to)
                            val matches=if(inRange) onDate(date) else emptyList()
                            cell.text="$day"+(if(matches.isNotEmpty()) "\n${matches.size}건" else "")
                            cell.setTextColor(if(!inRange) Color.rgb(190,195,190) else if(column==0) Color.rgb(169,66,66) else ink)
                            cell.contentDescription="$date · "+if(!inRange) "조회 범위 밖" else "${matches.size}개 현장"
                            if(inRange) cell.background=GradientDrawable().apply { setColor(if(matches.isNotEmpty()) green else Color.rgb(247,249,247));cornerRadius=dp(8).toFloat();if(date==today)setStroke(dp(2),Color.rgb(52,100,75)) }
                            if(matches.isNotEmpty()) { cell.isClickable=true;cell.setOnClickListener {
                                AlertDialog.Builder(context).setTitle("$date · ${matches.size}개 현장")
                                    .setItems(matches.map { it.optString("name")+" · "+it.optString("status") }.toTypedArray()) { _,i -> onSite(matches[i].optString("id")) }
                                    .setNegativeButton("닫기",null).show()
                            } }
                        }
                        line.addView(cell,LinearLayout.LayoutParams(0,-2,1f).apply { setMargins(dp(1),dp(1),dp(1),dp(1)) })
                    }
                    card.addView(line)
                }
                month=month.plusMonths(1)
            }
            card.addView(label("날짜를 누르면 그날의 현장을 확인할 수 있습니다.",12f).apply { setTextColor(muted) })
            val agenda=sites.flatMap { site -> val days=site.optJSONArray("dates") ?: JSONArray();(0 until days.length()).map { days.optString(it) to site } }.sortedBy { it.first }
            if(agenda.isNotEmpty()) table(listOf("날짜","현장","상태"),listOf(105,200,90),agenda.map { (date,site) -> listOf(date,site.optString("name"),site.optString("status")) to site.optString("id") })
        } else if(sites.isNotEmpty()) {
            table(listOf("번호","현장","상태","주소"),listOf(48,160,85,240),sites.mapIndexed { i,s -> listOf("${i+1}",s.optString("name"),s.optString("status"),s.optString("address")) to s.optString("id") })
        }
        if(sites.isEmpty()) card.addView(label("조건에 맞는 현장이 없습니다.",15f))
        else card.addView(label("표는 좌우로 밀어 볼 수 있어요. 현장을 누르면 상세 정보를 확인합니다.",12f).apply { setTextColor(muted) })
        if(result.optInt("total")>sites.size) card.addView(label("전체 ${result.optInt("total")}개 중 ${sites.size}개만 표시했습니다. 기간이나 검색 범위를 좁혀 주세요.",13f,true))
        return card
    }
}
