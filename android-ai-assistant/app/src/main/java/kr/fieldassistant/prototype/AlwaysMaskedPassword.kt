package kr.fieldassistant.prototype

import android.graphics.Rect
import android.text.method.TransformationMethod
import android.view.View

/** Never briefly reveal the most recently typed password character. */
internal class AlwaysMaskedPassword : TransformationMethod {
    override fun getTransformation(source:CharSequence?,view:View?):CharSequence = object:CharSequence {
        override val length:Int get()=source?.length ?: 0
        override fun get(index:Int):Char { require(index in 0 until length);return '\u2022' }
        override fun subSequence(startIndex:Int,endIndex:Int):CharSequence = "\u2022".repeat(endIndex-startIndex)
        override fun toString():String="\u2022".repeat(length)
    }
    override fun onFocusChanged(view:View?,sourceText:CharSequence?,focused:Boolean,direction:Int,previouslyFocusedRect:Rect?) {}
}
