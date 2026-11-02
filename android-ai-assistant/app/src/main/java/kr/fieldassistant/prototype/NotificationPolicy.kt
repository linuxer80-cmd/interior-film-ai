package kr.fieldassistant.prototype

internal object NotificationPolicy {
    fun enabled(permissionGranted: Boolean, appEnabled: Boolean, channelEnabled: Boolean): Boolean =
        permissionGranted && appEnabled && channelEnabled

    fun shouldRequestPermission(permissionGranted: Boolean, askedBefore: Boolean, showRationale: Boolean): Boolean =
        !permissionGranted && (!askedBefore || showRationale)
}
