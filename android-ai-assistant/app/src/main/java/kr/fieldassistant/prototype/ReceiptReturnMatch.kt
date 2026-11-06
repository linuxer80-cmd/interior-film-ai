package kr.fieldassistant.prototype

import java.text.Normalizer
import java.util.Locale

/** Conservative receipt-to-roll matching; an unrecognised identity never matches. */
internal object ReceiptReturnMatch {
    private fun key(s:String)=Normalizer.normalize(s,Normalizer.Form.NFKC).uppercase(Locale.ROOT).replace(Regex("[\\s&·._-]+"),"")
    private fun family(s:String):String {
        val k=key(s)
        return when(k) {
            "현대","현대C","현대HC","현대LC","현대LNC","현대보닥","현대인테리어필름","현대필름","현대보닷","보닥","HYUNDAI","HYUNDAILC","HYUNDAILNC","HYUNDAIHC","HYUNDAIBODAQ","BODAQ"->"HYUNDAI"
            "영림","영림필름","영림인테리어필름","YOUNGLIM","YOUNGLIMINTERIORFILM"->"YOUNGLIM"
            "LX","LX베니프","LX하우시스","LX하우시스베니프","베니프","BENIF","LXBENIF","LXHAUSYS","LXHAUSYSBENIF"->"LX"
            else->k
        }
    }
    private data class Code(val base:String,val type:String?)
    private fun code(value:String,maker:String):Code {
        val v=Normalizer.normalize(value,Normalizer.Form.NFKC).uppercase(Locale.ROOT).replace(Regex("\\s+"),"")
        if(v.matches(Regex("^[GFRE][A-Z][A-Z0-9-]*[0-9][A-Z0-9-]*$"))) {
            val type=when { maker=="HYUNDAI" && v[0]=='G'->"non_fire";maker=="HYUNDAI" && v[0]=='F'->"fire";maker=="LX" && v[0]=='R'->"fire";maker=="LX" && v[0]=='E'->"non_fire";else->null }
            if(type!=null) return Code(v.drop(1),type)
        }
        return Code(v,null)
    }
    fun matches(receiptBrand:String,receiptCode:String,receiptType:String,rollBrand:String,rollCode:String,purchaseType:String):Boolean {
        val a=family(receiptBrand);val b=family(rollBrand)
        if(a.isBlank() || b.isBlank() || a!=b || receiptCode.isBlank() || rollCode.isBlank() || purchaseType !in listOf("fire","non_fire")) return false
        val x=code(receiptCode,a);val y=code(rollCode,b)
        if(x.base.isBlank() || x.base!=y.base) return false
        if(receiptType !in listOf("fire","non_fire")) return false
        if(x.type!=null && x.type!=receiptType || y.type!=null && y.type!=purchaseType) return false
        return receiptType==purchaseType
    }
}
