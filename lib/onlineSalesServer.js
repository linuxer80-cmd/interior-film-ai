import {createCipheriv,createDecipheriv,hkdfSync,randomBytes,randomUUID} from 'node:crypto';
import {authenticateAdmin} from './siteCallAuth';
import {createClient} from '@supabase/supabase-js';
import {MARKETING_COMPANY_ID,canUseOnlineSales,reportingPeriod,summarize} from './onlineSales.mjs';
import {loadDaangnReport} from './daangnAds.mjs';
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
function encryptionKey() {
  const root=process.env.MARKETING_TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!root || root.length<32)throw Error('암호화 서버 설정 누락');
  return Buffer.from(hkdfSync('sha256',root,'filmjang-online-sales-v1','daangn-api-key',32));
}
const context=id=>Buffer.from(`${MARKETING_COMPANY_ID}:daangn:${id}`);
export function sealKey(value,id) {
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',encryptionKey(),iv);c.setAAD(context(id));
  const body=Buffer.concat([c.update(value,'utf8'),c.final()]);
  return ['v1',iv.toString('base64url'),c.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
function openKey(value,id) {
  const [v,iv,tag,body]=value.split('.');if(v!=='v1')throw Error('암호화 버전 오류');
  const c=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));c.setAAD(context(id));c.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([c.update(Buffer.from(body,'base64url')),c.final()]).toString('utf8');
}
export async function connectionRow(db) {
  const {data,error}=await db.from('online_sales_connections').select('*').eq('company_id',MARKETING_COMPANY_ID).eq('platform','daangn').single();
  if(error)throw error;return data;
}
export function publicConnection(row) {
  return {connected:!!row.api_key_ciphertext,advertiserId:row.advertiser_id,lastSyncedAt:row.last_synced_at,lastError:row.last_error,snapshot:row.snapshot,autoSync:!!row.api_key_ciphertext};
}
export async function withMarketingLock(db,work) {
  const token=randomUUID(),now=new Date(),until=new Date(now.getTime()+180000).toISOString();
  const {data,error}=await db.from('online_sales_connections').update({lock_token:token,locked_until:until}).eq('company_id',MARKETING_COMPANY_ID).eq('platform','daangn').lt('locked_until',now.toISOString()).select('company_id');
  if(error)throw error;
  if(!data?.length)throw Object.assign(Error('잠시 후 다시 시도해주세요.'),{status:429,publicMessage:'이미 조회 중이거나 재시도 대기 중입니다. 잠시 후 다시 시도해주세요.'});
  try { return await work(token); }
  finally { await db.from('online_sales_connections').update({lock_token:null,locked_until:new Date(Date.now()+60000).toISOString()}).eq('company_id',MARKETING_COMPANY_ID).eq('platform','daangn').eq('lock_token',token); }
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
