package kr.fieldassistant.prototype

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AdminReportSnapshotTest {
    private fun base()=JSONObject().put("hasReport",true)
        .put("review",JSONObject().put("status","pending"))
        .put("report",JSONObject().put("id","report").put("updated_at","revision").put("work_summary","시공"))
        .put("materials",JSONArray().put(JSONObject().put("id","material").put("quantity",2).put("unit_price",5000)))
        .put("expenses",JSONArray().put(JSONObject().put("id","expense").put("amount",10000)))
        .put("beforePhotos",JSONArray()).put("afterPhotos",JSONArray().put(JSONObject().put("id","photo").put("photo_type","after").put("storage_path","x").put("signed_url","old")))
    @Test fun ignoresRefreshedTemporaryPhotoUrl() {
        val a=base();val b=JSONObject(a.toString());b.getJSONArray("afterPhotos").getJSONObject(0).put("signed_url","new")
        assertEquals(AdminReportSnapshot.key(a),AdminReportSnapshot.key(b))
    }
    @Test fun costPhotosAndRevisionChangesRequireRecheck() {
        val a=base();val key=AdminReportSnapshot.key(a);assertNotNull(key)
        val changed=JSONObject(a.toString());changed.getJSONArray("expenses").getJSONObject(0).put("amount",20000)
        assertNotEquals(key,AdminReportSnapshot.key(changed))
        val removed=JSONObject(a.toString()).put("afterPhotos",JSONArray());assertNotEquals(key,AdminReportSnapshot.key(removed))
        val newReport=JSONObject(a.toString());newReport.getJSONObject("report").put("updated_at","changed");assertNotEquals(key,AdminReportSnapshot.key(newReport))
    }
    @Test fun incompleteAndNonPendingReportsCannotBeReviewed() {
        val a=base();a.getJSONObject("review").put("status","approved");assertNull(AdminReportSnapshot.key(a))
        val b=base();b.remove("materials");assertNull(AdminReportSnapshot.key(b))
    }
}
