import { sameFilmProduct, filmCodeInfo } from "./hyundaiFilmCode.js";
const literal = value => value.replace(/[\\%_]/g, c => "\\"+c);
// Search code first, then compare normalized brands. Never choose across brands or guess among duplicates.
export async function matchingFilmProducts(db, brand, code) {
  if (!brand || !code) return [];
  const info=filmCodeInfo(brand,code);
  const codes=[...new Set([info.originalCode, info.baseCode])];
  const rows=[];
  for (const candidate of codes) {
  for(let offset=0;offset<10000;offset+=500) {
    const r=await db.from("film_products").select("id,brand,product_code")
      .ilike("product_code",literal(candidate)).order("id").range(offset,offset+499);
    if(r.error)throw r.error;
    rows.push(...(r.data||[]).filter(p=>sameFilmProduct(brand,code,p.brand,p.product_code)));
    if((r.data||[]).length<500){
      break;
    }
    if(offset + 500 >= 10000) throw Error("동일 제품 조회 범위를 초과했습니다.");
  }
  }
  if(rows.length) return [...new Map(rows.map(row => [row.id, row])).values()];
  const alias=await db.rpc("resolve_film_alias",{p_brand:brand,p_value:code});
  if(alias.error)throw alias.error;
  return alias.data||[];
}

