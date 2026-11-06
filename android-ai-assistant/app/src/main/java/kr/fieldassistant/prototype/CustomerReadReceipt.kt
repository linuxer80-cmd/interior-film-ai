package kr.fieldassistant.prototype

/** Tracks acknowledgements for the latest customer message visible in one open conversation. */
internal class CustomerReadReceipt {
    private var acknowledged = ""
    private var inFlight = ""

    fun visible(timestamp: String, isVisible: Boolean): String? {
        if (!isVisible || timestamp.isBlank() || timestamp == acknowledged || inFlight.isNotEmpty()) return null
        inFlight = timestamp
        return timestamp
    }

    fun completed(timestamp: String) {
        if (inFlight == timestamp) {
            acknowledged = timestamp
            inFlight = ""
        }
    }

    fun failed(timestamp: String) {
        if (inFlight == timestamp) inFlight = ""
    }
}
