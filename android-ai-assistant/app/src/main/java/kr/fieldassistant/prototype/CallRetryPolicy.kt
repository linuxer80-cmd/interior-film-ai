package kr.fieldassistant.prototype

internal object CallRetryPolicy {
    fun shouldRetry(failed:Boolean,attempts:Int):Boolean = failed && attempts in 1..2
}
