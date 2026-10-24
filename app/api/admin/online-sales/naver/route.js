import {marketingAdmin,marketingJson,marketingError,connectionRow,publicConnection,withMarketingLock} from '../../../../../lib/onlineSalesServer';
import {naverCredentials} from '../../../../../lib/naverAds.mjs';
import {syncNaver,naverKeywords} from '../../../../../lib/naverSalesServer';
import {MARKETING_COMPANY_ID} from '../../../../../lib/onlineSales.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request){
  try{const {db}=await marketingAdmin(request);return marketingJson(publicConnection(await connectionRow(db,'naver')));}
  catch(e){return marketingError(e);}
}
export async function POST(request){
  try{
    const {db}=await marketingAdmin(request);
    if(Number(request.headers.get('content-length'))>16000)return marketingJson({error:'요청이 너무 큽니다.'},413);
    const body=await request.json();
    if(body.action==='connect')return marketingJson(await syncNaver(db,naverCredentials(body)));
    if(body.action==='sync')return marketingJson(await syncNaver(db));
    if(body.action==='keywords')return marketingJson(await naverKeywords(db,String(body.groupId||'')));
    if(body.action==='disconnect'){
      await withMarketingLock(db,async token=>{
        const {error}=await db.from('online_sales_connections').update({advertiser_id:null,api_key_ciphertext:null,snapshot:null,last_synced_at:null,last_error:null}).eq('company_id',MARKETING_COMPANY_ID).eq('platform','naver').eq('lock_token',token);if(error)throw error;
      },'naver');
      return marketingJson(publicConnection(await connectionRow(db,'naver')));
    }
    return marketingJson({error:'지원하지 않는 작업입니다.'},400);
  }catch(e){return marketingError(e);}
}
