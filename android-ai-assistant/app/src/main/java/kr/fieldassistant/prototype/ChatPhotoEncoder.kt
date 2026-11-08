package kr.fieldassistant.prototype

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/** Bounded decode applies camera orientation and strips metadata when encoding JPEG. */
internal object ChatPhotoEncoder {
    fun encode(context:Context,uri:Uri,maxBytes:Int=2*1024*1024):ByteArray {
        val input=context.contentResolver.openInputStream(uri)?.use { SecureTransport.readBounded(it,32*1024*1024) }
            ?: error("사진을 열지 못했습니다.")
        val bitmap=ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(input))) { decoder,info,_ ->
            val w=info.size.width;val h=info.size.height
            require(w>0 && h>0 && w.toLong()*h<=200_000_000) { "사진 크기를 확인해 주세요." }
            val scale=minOf(1.0,1600.0/maxOf(w,h))
            decoder.setTargetSize(maxOf(1,(w*scale).toInt()),maxOf(1,(h*scale).toInt()))
            decoder.allocator=ImageDecoder.ALLOCATOR_SOFTWARE
        }
        try {
            for(quality in listOf(85,75,60,45)) {
                val output=ByteArrayOutputStream()
                check(bitmap.compress(Bitmap.CompressFormat.JPEG,quality,output))
                if(output.size()<=maxBytes) return output.toByteArray()
            }
            error("사진 용량을 줄이지 못했습니다.")
        } finally { bitmap.recycle() }
    }
}
