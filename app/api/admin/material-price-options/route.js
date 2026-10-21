import {privateAuth,privateJson as json,uuid} from '../../../../lib/workerPrivate';
import {matchingFilmProducts} from '../../../../lib/matchingFilmProducts.mjs';
import {sameFilmProduct,filmCodeInfo} from '../../../../lib/hyundaiFilmCode';
export const runtime='nodejs';
const value=r=>{if(r.error)throw r.error;return r.data;};
export async function GET(request){
 try{
  const auth=await privateAuth(request);if(auth.error)return json({error:auth.error},auth.status);
  const {db,user,companyId}=auth,q=new URL(request.url).searchParams;
  const siteId=q.get('siteId'),materialId=q.get('materialId'),brand=(q.get('brand')||'').trim(),code=(q.get('code')||'').trim();
  if(!uuid(siteId)||(materialId&&!uuid(materialId))||!brand||brand.length>100||code.length<2||code.length>100)return json({error:'현장과 제품 코드를 확인해주세요.'},400);
  const site=value(await db.from('sites').select('id').eq('id',siteId).eq('company_id',companyId).maybeSingle());
  if(!site)return json({error:'현장을 확인할 수 없습니다.'},404);
  if(materialId){
   const material=value(await db.from('site_materials').select('id,brand,product_code,material_type,unit').eq('id',materialId).eq('site_id',siteId).eq('company_id',companyId).maybeSingle());
   if(!material||material.material_type!=='actual')return json({error:'실제 사용 자재를 확인해주세요.'},404);
   if(sameFilmProduct(brand,code,material.brand,material.product_code)){
    const saved=await db.rpc('material_purchase_cost',{p_user:user.id,p_material:material.id,p_body:{action:'get'}});
    if(saved.error){if(saved.error.code==='22023')return json({options:[],message:saved.error.message});throw saved.error;}
    return json({version:saved.data?.version,materialId:material.id,quantity:saved.data?.quantity,options:saved.data?.options||[],unit:saved.data?.unit||material.unit,message:saved.data?.options?.length?'':'등록된 매입단가가 없습니다. 직접 입력해주세요.'});
   }
  }
  const products=await matchingFilmProducts(db,brand,code);
  if(!products.length)return json({options:[],unit:'m',message:'등록된 매입단가가 없습니다. 직접 입력해주세요.'});
  const prices=value(await db.from('film_dealer_prices').select('id,dealer_id,product_id,price_type,unit_price').eq('company_id',companyId).in('product_id',products.map(p=>p.id)));
  const dealers=prices.length?value(await db.from('film_dealers').select('id,name').eq('company_id',companyId).in('id',[...new Set(prices.map(p=>p.dealer_id))])):[];
  const type=filmCodeInfo(brand,code).priceType;
  const options=prices.filter(p=>p.unit_price!=null&&Number.isFinite(Number(p.unit_price))&&Number(p.unit_price)>=0&&dealers.some(d=>d.id===p.dealer_id)&&(['fire','non_fire'].includes(type)?p.price_type===type:true)).map(p=>({id:p.id,unitPrice:Number(p.unit_price),label:`${dealers.find(d=>d.id===p.dealer_id).name} · ${p.price_type==='fire'?'방염':p.price_type==='non_fire'?'비방염':'구분 미지정'} · 현재 공급가`}));
  return json({options,unit:'m',message:options.length?'':'등록된 매입단가가 없습니다. 직접 입력해주세요.'});
 }catch(error){console.error('매입단가 자동 조회 실패:',error.code||error.message);return json({error:'매입단가를 불러오지 못했습니다. 다시 조회하거나 직접 입력해주세요.'},500);}
}
