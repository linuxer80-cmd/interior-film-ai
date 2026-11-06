package kr.fieldassistant.prototype

import org.json.JSONObject
import org.json.JSONArray
import java.math.BigDecimal

internal object ReceiptReturnState {
    fun complete(raw:String,index:Int,requestId:String,quantity:String,rollId:String):String {
        val draft=JSONObject(raw);val row=draft.getJSONObject("analysis").getJSONArray("rows").getJSONObject(index)
        check(row.optString("action")=="supplier_return" && !row.optBoolean("_done") && row.optString("_returnPending")==requestId)
        val remaining=row.getString("_returnRemaining").toBigDecimal();val amount=quantity.toBigDecimal()
        require(amount>BigDecimal.ZERO && amount<=remaining)
        val ids=row.optJSONArray("_returnedRollIds") ?: JSONArray()
        check((0 until ids.length()).none { ids.optString(it)==rollId })
        ids.put(rollId);row.put("_returnedRollIds",ids)
        val left=remaining.subtract(amount);row.put("_returnRemaining",left.toPlainString()).remove("_returnPending")
        row.put("_returnCount",row.optInt("_returnCount",0)+1)
        if(left.compareTo(BigDecimal.ZERO)==0) row.put("_done",true)
        return draft.toString()
    }
}
