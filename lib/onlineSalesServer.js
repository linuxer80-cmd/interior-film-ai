import {randomUUID} from 'node:crypto';
import {sealKey,openKey} from './onlineSalesCrypto.mjs';
export {sealKey,openKey} from './onlineSalesCrypto.mjs';
import {authenticateAdmin} from './siteCallAuth';
import {createClient} from '@supabase/supabase-js';
import {MARKETING_COMPANY_ID,canUseOnlineSales,reportingPeriod,summarize} from './onlineSales.mjs';
import {loadDaangnReport} from './daangnAds.mjs';
import {normalizeNaverSnapshot} from './naverAds.mjs';
export const marketingJson=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
export async function marketingAdmin(request) {
  const auth=await authenticateAdmin(request);
  if(auth.error)throw Object.assign(Error(auth.error),{status:auth.status,publicMessage:auth.error});
  if(!canUseOnlineSales(auth.companyId))throw Object.assign(Error('필름장이 관리자만 이용할 수 있습니다.'),{status:403,publicMessage:'필름장이 관리자만 이용할 수 있습니다.'});
  return auth;
}
export function marketingDb() {
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('서버 설정 누락');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function connectionRow(db,platform='daangn') {
  const {data,error}=await db.from('online_sales_connections').select('*').eq('company_id',MARKETING_COMPANY_ID).eq('platform',platform).single();
  if(error)throw error;return data;
}
export function publicConnection(row) {
  return {connected:!!row.api_key_ciphertext,advertiserId:row.advertiser_id,lastSyncedAt:row.last_synced_at,lastError:row.last_error,snapshot:row.platform==='naver'?normalizeNaverSnapshot(row.snapshot):row.snapshot,autoSync:!!row.api_key_ciphertext};
}
export async function withMarketingLock(db,work,platform='daangn',cooldownMs=60000) {
  const token=randomUUID(),now=new Date(),until=new Date(now.getTime()+180000).toISOString();
  const {data,error}=await db.from('online_sales_connections').update({lock_token:token,locked_until:until}).eq('company_id',MARKETING_COMPANY_ID).eq('platform',platform).lt('locked_until',now.toISOString()).select('company_id');
  if(error)throw error;
  if(!data?.length)throw Object.assign(Error('잠시 후 다시 시도해주세요.'),{status:429,publicMessage:'이미 조회 중이거나 재시도 대기 중입니다. 잠시 후 다시 시도해주세요.'});
  try { return await work(token); }
  finally { await db.from('online_sales_connections').update({lock_token:null,locked_until:new Date(Date.now()+cooldownMs).toISOString()}).eq('company_id',MARKETING_COMPANY_ID).eq('platform',platform).eq('lock_token',token); }
}
export async function syncDaangn(db,credentials) {
  return withMarketingLock(db,async token=>{
    try {
      const row=await connectionRow(db);
      const creds=credentials || (row.api_key_ciphertext ? {advertiserId:row.advertiser_id,apiKey:openKey(row.api_key_ciphertext,row.advertiser_id)} : null);
      if(!creds)throw Object.assign(Error('당근 API 키를 먼저 연결해주세요.'),{status:400,publicMessage:'당근 API 키를 먼저 연결해주세요.'});
      const period=reportingPeriod(),data=await loadDaangnReport(creds,period),snapshot={...summarize(data.campaigns,data.performances),period};
      const update={snapshot,last_synced_at:new Date().toISOString(),last_error:null};
      if(credentials)Object.assign(update,{advertiser_id:creds.advertiserId,api_key_ciphertext:sealKey(creds.apiKey,creds.advertiserId)});
      const {error}=await db.from('online_sales_connections').update(update).eq('company_id',MARKETING_COMPANY_ID).eq('platform','daangn').eq('lock_token',token);
      if(error)throw error;
      return publicConnection(await connectionRow(db));
    } catch(e) {
      await db.from('online_sales_connections').update({last_error:e.publicMessage||'조회하지 못했습니다. 연결 설정을 확인해주세요.'}).eq('company_id',MARKETING_COMPANY_ID).eq('platform','daangn').eq('lock_token',token);
      throw e;
    }
  });
}
export function marketingError(e) { return marketingJson({error:e.publicMessage||'온라인 영업관리를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'},e.status||500); }
