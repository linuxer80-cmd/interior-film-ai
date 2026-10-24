import {marketingAdmin,marketingJson,marketingError,connectionRow,publicConnection,syncDaangn,withMarketingLock} from '../../../../lib/onlineSalesServer';
import {credentials,MARKETING_COMPANY_ID} from '../../../../lib/onlineSales.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request) {
  try {
    const {db,companyId}=await marketingAdmin(request);
    if(new URL(request.url).searchParams.get('access')==='1')return marketingJson({allowed:true,companyId});
    return marketingJson(publicConnection(await connectionRow(db)));
  } catch(e) { return marketingError(e); }
}
export async function POST(request) {
  try {
    const {db}=await marketingAdmin(request);
    if(Number(request.headers.get('content-length'))>12000)return marketingJson({error:'요청이 너무 큽니다.'},413);
    const body=await request.json();
    if(body.action==='connect') {
      let value;
      try { value=credentials(body); } catch(e) { return marketingJson({error:e.message},400); }
      return marketingJson(await syncDaangn(db,value));
    }
    if(body.action==='sync')return marketingJson(await syncDaangn(db));
    if(body.action==='disconnect') {
      await withMarketingLock(db,async token=>{
        const {error}=await db.from('online_sales_connections').update({advertiser_id:null,api_key_ciphertext:null,snapshot:null,last_error:null,last_synced_at:null}).eq('company_id',MARKETING_COMPANY_ID).eq('platform','daangn').eq('lock_token',token);
        if(error)throw error;
      });
      return marketingJson(publicConnection(await connectionRow(db)));
    }
    return marketingJson({error:'지원하지 않는 작업입니다.'},400);
  } catch(e) { return marketingError(e); }
}
