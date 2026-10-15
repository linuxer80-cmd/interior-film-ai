import { createHmac, timingSafeEqual } from 'node:crypto';
import { expandPriceRules } from '../../../lib/dealerPriceImport.mjs';
import { priceOwner,priceReply,priceFault,allPriceRows } from '../../../lib/dealerPriceServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const signature=value=>createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY).update(JSON.stringify(value)).digest('hex');
export async function POST(request) {
  try {
    const {db,companyId,userId}=await priceOwner(request);
    const raw=await request.text();
    if(raw.length>2500000) throw priceFault('입력 내용이 너무 큽니다.');
    const body=JSON.parse(raw);
    if(!uuid.test(body.dealerId||'')) throw priceFault('대리점을 선택해주세요.');
    const dealer=await db.from('film_dealers').select('id').eq('company_id',companyId).eq('id',body.dealerId).maybeSingle();
    if(dealer.error) throw dealer.error;
    if(!dealer.data) throw priceFault('본인 업체의 대리점만 선택해주세요.',403);
    if(body.action==='preview') {
      const [products,supply,selling]=await Promise.all([
        allPriceRows(()=>db.from('film_products').select('id,brand,product_code,legacy_non_fire_code').eq('is_active',true).order('id')),
        allPriceRows(()=>db.from('film_dealer_prices').select('product_id,price_type,unit_price,revision').eq('company_id',companyId).eq('dealer_id',body.dealerId).order('id')),
        allPriceRows(()=>db.from('company_film_selling_prices').select('product_id,price_type,interior_price,consumer_price,revision').eq('company_id',companyId).order('product_id').order('price_type'))
      ]);
      const preview=expandPriceRules(body.rules,products);
      const rows=preview.rows.map(r=>{
        const s=supply.find(p=>p.product_id===r.productId && p.price_type===r.priceType);
        const t=selling.find(p=>p.product_id===r.productId && p.price_type===r.priceType);
        return {...r,supplyRevision:s?.revision||0,sellingRevision:t?.revision||0,oldSupply:s?.unit_price??null,oldInterior:t?.interior_price??null,oldConsumer:t?.consumer_price??null};
      });
      const payload={companyId,userId,dealerId:body.dealerId,expires:Date.now()+1800000,rows};
      return priceReply({...preview,rows,payload,signature:signature(payload)});
    }
    if(body.action!=='save' || !uuid.test(body.requestId||'')) throw priceFault('저장 요청을 확인해주세요.');
    const p=body.payload;
    if(!p || p.companyId!==companyId || p.userId!==userId || p.dealerId!==body.dealerId || !Number.isFinite(p.expires) || p.expires<Date.now() || !Array.isArray(p.rows) || !/^[a-f0-9]{64}$/.test(body.signature||'') || !timingSafeEqual(Buffer.from(signature(p),'hex'),Buffer.from(body.signature,'hex'))) throw priceFault('미리보기가 만료되었거나 변경됐습니다. 다시 확인해주세요.',409);
    const result=await db.rpc('import_dealer_prices',{p_user:userId,p_dealer:body.dealerId,p_request:body.requestId,p_rows:p.rows});
    if(result.error) {
      if(['40001','42501','22023','23505'].includes(result.error.code)) throw priceFault(result.error.message,409);
      throw result.error;
    }
    return priceReply(result.data);
  } catch(error) {
    return priceReply({error:error.status?error.message:'단가표를 처리하지 못했습니다. 일괄등록 SQL 적용 여부와 연결을 확인해주세요.'},error.status||503);
  }
}
