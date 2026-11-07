package kr.fieldassistant.prototype

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.widget.*

/** Shared visual treatment for native business screens; all sizes respect display density. */
internal class BusinessUi(private val context:Context) {
    val ink=0xff203c32.toInt()
    val muted=0xff65746c.toInt()
    val accent=0xff315c48.toInt()
    val canvas=0xfff5f6f2.toInt()
    fun dp(value:Int)=(value*context.resources.displayMetrics.density).toInt()
    fun shape(color:Int,stroke:Int=0xffdde4dd.toInt(),radius:Int=18)=GradientDrawable().apply {
        setColor(color);cornerRadius=dp(radius).toFloat();setStroke(dp(1),stroke)
    }
    fun text(value:String,size:Float=14f,bold:Boolean=false,color:Int=ink)=TextView(context).apply {
        text=value;textSize=size;setTextColor(color);includeFontPadding=true
        if(bold)setTypeface(typeface,Typeface.BOLD)
        setLineSpacing(dp(3).toFloat(),1f)
    }
    fun card(parent:LinearLayout):LinearLayout=LinearLayout(context).apply {
        orientation=LinearLayout.VERTICAL;setPadding(dp(18),dp(16),dp(18),dp(16))
        background=shape(0xffffffff.toInt())
        parent.addView(this,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(12)})
    }
    fun heading(parent:LinearLayout,title:String,subtitle:String="") {
        parent.addView(text(title,25f,true),LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(8);bottomMargin=dp(6)})
        if(subtitle.isNotBlank())parent.addView(text(subtitle,color=muted),LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(18)})
    }
    fun button(value:String,primary:Boolean=false)=Button(context).apply {
        text=value;isAllCaps=false;textSize=14f;setTypeface(typeface,Typeface.BOLD)
        gravity=Gravity.CENTER;minHeight=dp(48);minimumHeight=dp(48);stateListAnimator=null
        setPadding(dp(14),dp(10),dp(14),dp(10))
        background=RippleDrawable(ColorStateList.valueOf(0x22315c48),shape(if(primary)accent else 0xffffffff.toInt(),if(primary)accent else 0xffd5dfd6.toInt(),14),null)
        setTextColor(ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled),intArrayOf()),intArrayOf(0xff99a49d.toInt(),if(primary)0xffffffff.toInt() else accent)))
    }
    fun badge(parent:LinearLayout,value:String,urgent:Boolean=false) {
        parent.addView(text(value,12f,true,if(urgent)0xff98502d.toInt() else accent).apply{
            setPadding(dp(10),dp(5),dp(10),dp(5));background=shape(if(urgent)0xfffff1e8.toInt() else 0xffedf3ed.toInt(),0x00000000,8)
        },LinearLayout.LayoutParams(-2,-2).apply{bottomMargin=dp(10)})
    }
}
