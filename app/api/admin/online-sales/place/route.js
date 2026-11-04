import {marketingAdmin,marketingJson,marketingError,connectionRow,withMarketingLock} from '../../../../../lib/onlineSalesServer';
import {MARKETING_COMPANY_ID} from '../../../../../lib/onlineSales.mjs';
import {publicPlaceConnection,syncPlace} from '../../../../../lib/naverPlaceServer';
import {placeCredentials} from '../../../../../lib/naverPlace.mjs';
export const runtime='nodejs';
export const maxDuration=30;
export async function GET(request){
  try{const {db}=await marketingAdmin(request);return marketingJson(publicPlaceConnection(await connectionRow(db,'naver_place')));}
  catch(e){return marketingError(e);}
}
export async function POST(request){
  try{
    const {db}=await marketingAdmin(request);
    if(Number(request.headers.get('content-length'))>10000)return marketingJson({error:'요청이 너무 큽니다.'},413);
    const raw=await request.text();if(Buffer.byteLength(raw)>10000)return marketingJson({error:'요청이 너무 큽니다.'},413);
    let body;try{body=JSON.parse(raw);}catch{return marketingJson({error:'요청 형식을 확인해주세요.'},400);}
    if(!body||typeof body!=='object')return marketingJson({error:'요청 형식을 확인해주세요.'},400);
    if(body.action==='connect')return marketingJson(await syncPlace(db,placeCredentials(body),body.autoSync===true));
    if(body.action==='sync')return marketingJson(await syncPlace(db));
    if(body.action==='disconnect'){
      await withMarketingLock(db,async token=>{
        const {error}=await db.from('online_sales_connections').update({advertiser_id:null,api_key_ciphertext:null,snapshot:null,last_error:null,last_synced_at:null}).eq('company_id',MARKETING_COMPANY_ID).eq('platform','naver_place').eq('lock_token',token);if(error)throw error;
      },'naver_place');
      return marketingJson(publicPlaceConnection(await connectionRow(db,'naver_place')));
    }
    return marketingJson({error:'지원하지 않는 작업입니다.'},400);
  }catch(e){return marketingError(e);}
}
