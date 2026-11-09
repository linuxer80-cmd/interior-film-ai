package kr.fieldassistant.prototype

import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest

/** Verify bounded bytes while streaming; never publish a partial or changed model. */
internal object ModelIntegrity {
    fun copyVerified(input:InputStream,output:OutputStream,expectedSize:Long,expectedHash:String,cancelled:()->Boolean={false}) {
        require(expectedSize>0 && Regex("[0-9a-f]{64}").matches(expectedHash))
        val digest=MessageDigest.getInstance("SHA-256");var size=0L;val buffer=ByteArray(65536)
        while(true) {
            if(cancelled()) throw InterruptedException("모델 준비가 중단되었습니다.")
            val n=input.read(buffer);if(n<0)break
            if(n==0)continue
            check(n<=expectedSize-size) { "음성 모델 크기가 올바르지 않습니다." }
            digest.update(buffer,0,n);output.write(buffer,0,n);size+=n
        }
        if(cancelled()) throw InterruptedException("모델 준비가 중단되었습니다.")
        val actual=digest.digest().joinToString("") { "%02x".format(it) }
        check(size==expectedSize && actual==expectedHash) { "음성 모델 파일 검증에 실패했습니다." }
    }
}
