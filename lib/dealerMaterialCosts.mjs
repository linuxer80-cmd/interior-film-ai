import {normalizeFilmBrand} from './filmBrand.mjs';
const code=v=>String(v||'').trim().toUpperCase();
const metre=v=>['m','미터'].includes(String(v||'m').trim().toLowerCase());
const knownType=v=>['fire','non_fire'].includes(v);
export function dealerMaterialCosts(rows,materials,trips,rolls,companyId) {
 const ownMaterials=materials.filter(m=>m.company_id===companyId);
 const rollMap=new Map(rolls.filter(r=>r.company_id===companyId).map(r=>[r.id,r]));
 const byId=new Map(ownMaterials.map(m=>[m.id,m]));
 const result=[];
 for(const row of rows||[]) {
  const source=byId.get(row.materialId);
  let planned=source?.material_type==='planned'?source:null;
  if(source?.material_type==='actual'&&metre(source.unit)) {
   const candidates=ownMaterials.filter(m=>m.material_type==='planned'&&!m.removed_at&&m.site_id===row.siteId&&metre(m.unit)&&
    code(m.product_code)===code(source.product_code)&&code(source.product_code)&&
    normalizeFilmBrand(m.brand)===normalizeFilmBrand(source.brand)&&
    (!knownType(source.price_type)||!knownType(m.price_type)||m.price_type===source.price_type));
   if(candidates.length===1)planned=candidates[0];
  }
  const relevant=planned?trips.filter(t=>t.company_id===companyId&&t.site_id===row.siteId&&t.material_id===planned.id):[];
  const pending=relevant.some(t=>t.issued==null||t.returned==null||!Number.isFinite(Number(t.issued))||!Number.isFinite(Number(t.returned))||Number(t.returned)<0||Number(t.issued)<Number(t.returned));
  const weights=new Map();
  if(!pending)for(const t of relevant) {
   const used=Number(t.issued)-Number(t.returned);
   if(used<=0)continue;
   const dealer=String(rollMap.get(t.roll_id)?.supplier||'').trim()||'대리점 미확인';
   weights.set(dealer,(weights.get(dealer)||0)+used);
  }
  const total=[...weights.values()].reduce((s,n)=>s+n,0);
  if(!total){result.push({...row,dealer:'대리점 미확인'});continue;}
  const entries=[...weights.entries()].sort(([a],[b])=>a.localeCompare(b,'ko'));
  let allocated=0,quantity=0;
  entries.forEach(([dealer,weight],index)=>{
   const last=index===entries.length-1;
   const amount=last?row.amount-allocated:Math.floor(row.amount*weight/total);
   const q=row.quantity==null?null:last?row.quantity-quantity:Math.floor(row.quantity*weight/total*1e6)/1e6;
   result.push({...row,dealer,amount,quantity:q,dealerAllocated:entries.length>1});
   allocated+=amount;quantity+=q||0;
  });
 }
 return result;
}
