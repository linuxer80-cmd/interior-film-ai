package kr.fieldassistant.prototype

import android.app.Activity
import android.content.Intent
import android.graphics.pdf.PdfDocument
import android.os.Bundle
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.widget.*
import androidx.core.content.FileProvider
import kotlinx.coroutines.*
import java.io.File

class QuoteExportActivity:Activity(){
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
    private var pdf:File?=null
    private val ui by lazy { BusinessUi(this) }
    private val uid get()=intent.getStringExtra("user").orEmpty()
    private val company get()=intent.getStringExtra("company").orEmpty()
    private fun valid()=!isFinishing&&!isDestroyed&&getSharedPreferences("assistant_user_$uid",MODE_PRIVATE).getString("selected_company",null)==company
    private fun notice(s:String){if(valid())Toast.makeText(this,s,Toast.LENGTH_LONG).show()}
    override fun onCreate(saved:Bundle?){
        super.onCreate(saved)
        val root=LinearLayout(this).apply{orientation=1;setBackgroundColor(ui.canvas);setOnApplyWindowInsetsListener{v,i->val a=i.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout() or android.view.WindowInsets.Type.ime());v.setPadding(a.left,a.top,a.right,a.bottom);android.view.WindowInsets.CONSUMED}}
        window.setDecorFitsSystemWindows(false)
        root.addView(ui.button("‹ 견적서").apply { setOnClickListener { finish() } },LinearLayout.LayoutParams(-1,-2).apply { setMargins(ui.dp(16),ui.dp(8),ui.dp(16),ui.dp(8)) })
        val heading=LinearLayout(this).apply { orientation=1;setPadding(ui.dp(20),0,ui.dp(20),0) };root.addView(heading)
        ui.heading(heading,"견적서 내보내기","내용을 확인하고 고객에게 전달하세요")
        val status=ui.text("저장된 견적서를 확인하고 있습니다…",13f,color=ui.muted);heading.addView(status,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=ui.dp(12) })
        val document=LinearLayout(this).apply { orientation=1;setPadding(ui.dp(16),ui.dp(4),ui.dp(16),ui.dp(16)) }
        val paper=ui.card(document);ui.badge(paper,"저장 내용 미리보기")
        val preview=ui.text("잠시만 기다려 주세요.",15f).apply { setTextIsSelectable(true);setLineSpacing(ui.dp(5).toFloat(),1f) };paper.addView(preview)
        root.addView(ScrollView(this).apply{addView(document)},LinearLayout.LayoutParams(-1,0,1f))
        val actions=LinearLayout(this).apply { orientation=0;setPadding(ui.dp(16),ui.dp(12),ui.dp(16),ui.dp(12));setBackgroundColor(0xffffffff.toInt()) }
        val save=ui.button("PDF 저장").apply { isEnabled=false };actions.addView(save,LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=ui.dp(8)})
        val share=ui.button("PDF 공유",true).apply { isEnabled=false;contentDescription="카카오톡 등으로 PDF 공유" };actions.addView(share,LinearLayout.LayoutParams(0,-2,1f))
        root.addView(actions);setContentView(root);root.requestApplyInsets()
        save.setOnClickListener{if(valid()&&pdf!=null)try{startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf").putExtra(Intent.EXTRA_TITLE,"견적서.pdf"),72)}catch(_:Exception){notice("파일 저장 앱을 열지 못했습니다.")}}
        share.setOnClickListener{if(valid())pdf?.let{file->try{val uri=FileProvider.getUriForFile(this,packageName+".quote-files",file);val send=Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);send.clipData=android.content.ClipData.newRawUri("견적서",uri);startActivity(Intent.createChooser(send,"견적서 PDF 공유"))}catch(_:Exception){notice("공유할 앱을 열지 못했습니다.")}}}
        scope.launch{try{
            val result=AccountAuth.shared(this@QuoteExportActivity).assistantQuote(uid,company,intent.getStringExtra("site").orEmpty())
            check(result.optInt("revision")>0){"견적서를 먼저 저장한 뒤 PDF를 만들어 주세요."}
            val text=QuoteDocument.text(result.getJSONObject("document"));val file=withContext(Dispatchers.IO){createPdf(text)}
            if(valid()){pdf=file;preview.text=text;status.text="저장된 견적서 · ${result.getInt("revision")}차 수정본\n작성 화면에서 저장하지 않은 내용은 포함되지 않습니다.";save.isEnabled=true;share.isEnabled=true}
        }catch(e:CancellationException){throw e}catch(e:Exception){if(valid())status.text=e.message?:"PDF를 만들지 못했습니다."}}
    }
    private fun createPdf(text:String):File{
        val directory=File(cacheDir,"quote-exports").apply{mkdirs()}
        directory.listFiles()?.filter{System.currentTimeMillis()-it.lastModified()>86400000L}?.forEach{it.delete()}
        val file=File(directory,"quote-${java.util.UUID.randomUUID()}.pdf")
        val paint=TextPaint().apply{textSize=11f;color=android.graphics.Color.BLACK;isAntiAlias=true}
        val layout=StaticLayout.Builder.obtain(text,0,text.length,paint,515).setAlignment(Layout.Alignment.ALIGN_NORMAL).setLineSpacing(3f,1f).setIncludePad(false).build()
        val doc=PdfDocument();try{var line=0;var number=1
            while(line<layout.lineCount){val start=layout.getLineTop(line);var end=line+1;while(end<layout.lineCount&&layout.getLineBottom(end)-start<=742)end++
                val bottom=layout.getLineBottom(end-1);val page=doc.startPage(PdfDocument.PageInfo.Builder(595,842,number++).create())
                page.canvas.save();page.canvas.clipRect(40,40,555,40+bottom-start);page.canvas.translate(40f,40f-start);layout.draw(page.canvas);page.canvas.restore()
                page.canvas.drawText("${number-1}",292f,810f,paint);doc.finishPage(page);line=end
            }
            file.outputStream().use{doc.writeTo(it)}
        }finally{doc.close()};return file
    }
    @Deprecated("Activity result compatibility")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);if(requestCode!=72||resultCode!=RESULT_OK||!valid())return;val uri=data?.data?:return;val file=pdf?:return;scope.launch{try{withContext(Dispatchers.IO){contentResolver.openOutputStream(uri,"wt")?.use{out->file.inputStream().use{it.copyTo(out)}}?:error("저장 위치를 열지 못했습니다.")};notice("PDF를 저장했습니다.")}catch(e:Exception){notice(e.message?:"저장하지 못했습니다.")}}}
    override fun onDestroy(){scope.cancel();super.onDestroy()}
}
