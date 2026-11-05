package kr.fieldassistant.prototype

import java.util.Locale

internal object SampleSearch {
    data class Query(val brand:String="",val code:String="",val category:String="")
    data class Product(val id:String,val brand:String,val code:String,val name:String,val category:String,val pattern:String,val image:String,val aliases:List<String> = emptyList(),val texture:String="")
    private fun norm(v:String)=v.trim().replace(Regex("[\\s&·._-]+"),"").uppercase(Locale.ROOT)
    private fun brand(v:String):String {
        val k=norm(v)
        return when {
            k in listOf("현대","현다","현대보닥","현대LNC","현대LC","현대인테리어필름","보닥","BODAQ","HYUNDAI") -> "HYUNDAI"
            k.startsWith("영림") || k=="YOUNGLIM" -> "YOUNGLIM"
            k.startsWith("LX") || k=="베니프" || k=="BENIF" -> "LX"
            k.startsWith("KCC") -> "KCC"
            k.startsWith("삼성") -> "SAMSUNG"
            k.startsWith("예림") -> "YERIM"
            k.startsWith("한솔") -> "HANSOL"
            k.startsWith("3M") -> "3M"
            else -> k
        }
    }
    private fun codeBase(brand:String,value:String):String {
        val k=norm(value)
        val family=brand(brand)
        return if(k.length>2 && k[1].isLetter() && k.any { it.isDigit() } && ((family=="HYUNDAI" && k[0] in "GF") || (family=="LX" && k[0] in "RE"))) k.drop(1) else k
    }
    fun parse(text:String):Query? {
        val q=text.trim();val compact=q.replace(Regex("\\s+"),"")
        if(!Regex("보여|찾아|검색|샘플|무늬|패턴").containsMatchIn(compact)) return null
        if(compact.contains("사진") && !compact.contains("샘플") && (compact.contains("현장") || compact.startsWith("그") || compact.startsWith("거기") || compact.startsWith("여기"))) return null
        if(compact.contains("현장") && !Regex("샘플|필름|패턴|무늬").containsMatchIn(compact)) return null
        if(Regex("삭제|등록|반출|반입|반납|재고|준비|사용했|사용량|견적|매출").containsMatchIn(compact)) return null
        val maker=when {
            Regex("현다|현대|보닥|BODAQ|HYUNDAI",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"HYUNDAI"
            Regex("영림|YOUNGLIM",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"YOUNGLIM"
            Regex("LX|베니프|BENIF",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"LX"
            Regex("KCC",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"KCC"
            compact.contains("삼성")->"SAMSUNG";compact.contains("예림")->"YERIM";compact.contains("한솔")->"HANSOL"
            compact.contains("3M",true)->"3M";else->""
        }
        val code=Regex("(?i)(?<![A-Z0-9])([A-Z]{1,8}[- ]?[0-9][A-Z0-9-]*)(?![A-Z0-9])").find(q)?.groupValues?.get(1)?.let(::norm).orEmpty()
        val category=when {
            Regex("우드|나무|원목|WOOD",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"wood"
            Regex("솔리드|단색|SOLID",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"solid"
            Regex("스톤|마블|대리석|STONE|MARBLE",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"stone"
            Regex("메탈|금속|METAL",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"metal"
            Regex("패브릭|페브릭|FABRIC",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"fabric"
            Regex("레더|가죽|LEATHER",RegexOption.IGNORE_CASE).containsMatchIn(compact)->"leather"
            else->""
        }
        if(maker.isBlank() && code.isBlank() && category.isBlank()) return null
        return Query(maker,code,category)
    }
    private fun category(p:Product):String {
        val stored=norm(p.category).lowercase(Locale.ROOT)
        when(stored) {
            "wood","우드"->return "wood";"solid","솔리드"->return "solid"
            "stone","marble","스톤","스톤마블","스톤앤마블"->return "stone"
            "metal","메탈"->return "metal";"fabric","패브릭","페브릭"->return "fabric"
            "leather","레더"->return "leather";"etc","기타","highglossy","하이글로시"->return "etc"
        }
        val c=norm(p.code)
        if(brand(p.brand)=="YOUNGLIM") {
            val v=if(c.startsWith("FP")) c.drop(1) else c
            when {
                Regex("^PMS[0-9]").containsMatchIn(v)->return "metal";Regex("^PUL[0-9]").containsMatchIn(v)->return "leather"
                Regex("^PSM?[0-9]").containsMatchIn(v)->return "solid";Regex("^PW[0-9]").containsMatchIn(v)->return "wood"
            }
            val text=p.pattern+" "+p.texture+" "+p.name
            return when { Regex("스톤|마블|대리석|stone|marble",RegexOption.IGNORE_CASE).containsMatchIn(text)->"stone";Regex("패브릭|페브릭|fabric",RegexOption.IGNORE_CASE).containsMatchIn(text)->"fabric";Regex("레더|가죽|leather",RegexOption.IGNORE_CASE).containsMatchIn(text)->"leather";Regex("메탈|metal",RegexOption.IGNORE_CASE).containsMatchIn(text)->"metal";Regex("우드|wood",RegexOption.IGNORE_CASE).containsMatchIn(text)->"wood";Regex("솔리드|solid",RegexOption.IGNORE_CASE).containsMatchIn(text)->"solid";else->"etc" }
        }
        return when {
            listOf("OGW","SPW","LW","ZX","W").any(c::startsWith)->"wood"
            listOf("PNT","PTW","ZSW","CP","HS","LM","LS").any(c::startsWith)->"solid"
            listOf("NS","PM","PNC").any(c::startsWith)->"stone"
            listOf("UMI","APZ","RM","VM").any(c::startsWith)->"metal"
            listOf("SF","RF","NF").any(c::startsWith)->"fabric"
            c.startsWith("SL")->"leather"
            listOf("ECF","EXF","BLC","SMT").any(c::startsWith)->"etc"
            c.startsWith("S")->"solid";else->"etc"
        }
    }
    fun matches(q:Query,p:Product):Boolean {
        if(q.brand.isNotBlank() && brand(p.brand)!=q.brand) return false
        if(q.code.isNotBlank() && (listOf(p.code)+p.aliases).none { codeBase(p.brand,it)==codeBase(p.brand,q.code) }) return false
        return q.category.isBlank() || category(p)==q.category
    }
}
