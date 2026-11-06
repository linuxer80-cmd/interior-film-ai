package kr.fieldassistant.prototype

internal object RecordingMonitorHealth {
    fun state(folder:Boolean,readPermission:Boolean,notifications:Boolean,active:Boolean,lastSuccess:Long,now:Long):String = when {
        !folder -> "녹음 폴더를 연결해 주세요."
        !readPermission -> "녹음 폴더 읽기 권한이 없습니다. 폴더를 다시 연결해 주세요."
        !active -> "녹음 감시가 시작되지 않았습니다. 로그인과 폴더 연결을 확인해 주세요."
        !notifications -> "녹음은 확인하지만 알림이 꺼져 있습니다."
        lastSuccess<=0L -> "녹음 폴더 확인을 기다리고 있습니다."
        now<lastSuccess || now-lastSuccess>30L*60*1000 -> "마지막 폴더 확인이 오래됐습니다. 절전 설정과 연결 상태를 확인해 주세요."
        else -> "녹음 폴더 확인과 알림이 연결되어 있습니다."
    }
}
