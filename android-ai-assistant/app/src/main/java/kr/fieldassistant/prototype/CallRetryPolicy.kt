package kr.fieldassistant.prototype

internal object CallRetryPolicy {
    fun shouldRetry(failed:Boolean,attempts:Int):Boolean = failed && attempts in 1..2
    fun retryEmpty(attempts:Int):Boolean = attempts in 0 until 6
    fun scanSummary(waiting:Boolean,emptyCount:Int,failedCount:Int,analyzedCount:Int):String = when {
        failedCount>0 -> "분석하지 못한 녹음 ${failedCount}건이 있습니다. 비서함에서 다시 분석해 주세요."
        emptyCount>0 && waiting -> "저장 중이거나 비어 있는 녹음 ${emptyCount}건을 잠시 후 다시 확인합니다."
        emptyCount>0 -> "비어 있는 녹음 ${emptyCount}건을 확인하지 못했습니다. 녹음이 저장됐는지 확인하고 다시 확인해 주세요."
        waiting -> "확인할 녹음이 남아 있어 잠시 후 다시 확인합니다."
        analyzedCount>0 -> "새 녹음 분석을 마쳤습니다. 아래 비서함을 확인해 주세요."
        else -> "연결된 폴더에 새 녹음이 없습니다."
    }
}
