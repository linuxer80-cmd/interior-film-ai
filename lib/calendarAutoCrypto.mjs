import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { CALENDAR_SCOPE } from './googleCalendar.mjs';
export const APP_ORIGIN = 'https://interior-film-ai.vercel.app';
export const CALLBACK_URI = APP_ORIGIN + '/api/calendar/auto/callback';
export const OAUTH_COOKIE = '__Host-calendar-oauth';
export const hashState = value => createHash('sha256').update(value).digest('hex');
export const randomSecret = () => randomBytes(32).toString('base64url');
export function equalSecret(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}
function key() {
  const value=process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || '';
  if(!/^[0-9a-f]{64}$/i.test(value)) throw Error('캘린더 서버 암호화 설정을 확인해주세요.');
  return Buffer.from(value,'hex');
}
export function seal(value,context) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
}
export function unseal(value,context) {
  const [version,iv,tag,data]=String(value).split('.');
  if(version!=='v1'||!iv||!tag||!data)throw Error('저장된 연결 정보를 확인해주세요.');
  const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
  cipher.setAAD(Buffer.from(context));cipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');
}
export function oauthConfig() {
  const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET;
  key();
  if(!clientId||!clientSecret)throw Error('구글 캘린더 서버 연결 설정을 먼저 완료해주세요.');
  return {clientId,clientSecret};
}
export function authorizationUrl(state,verifier) {
  const {clientId}=oauthConfig();
  return 'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:clientId,redirect_uri:CALLBACK_URI,response_type:'code',scope:CALENDAR_SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
}
export async function googleToken(fields,fetcher=fetch) {
  const {clientId,clientSecret}=oauthConfig();
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,...fields}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok||!data.access_token)throw Object.assign(Error('구글 연결을 갱신하지 못했습니다.'),{reconnect:data.error==='invalid_grant'});
  return data;
}
export function cookieState(request) {
  return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(OAUTH_COOKIE+'='))?.slice(OAUTH_COOKIE.length+1) || '';
}
export function stateCookie(state,maxAge=600) {return `${OAUTH_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
export function validState(state) {return typeof state==='string' && /^[A-Za-z0-9_-]{43}$/.test(state);}
