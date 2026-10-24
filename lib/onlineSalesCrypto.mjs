import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {MARKETING_COMPANY_ID} from './onlineSales.mjs';
function encryptionKey(platform='daangn') {
  const root=process.env.MARKETING_TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!root || root.length<32)throw Error('암호화 서버 설정 누락');
  return Buffer.from(hkdfSync('sha256',root,'filmjang-online-sales-v1',`${platform}-api-key`,32));
}
const context=(id,platform)=>Buffer.from(`${MARKETING_COMPANY_ID}:${platform}:${id}`);
export function sealKey(value,id,platform='daangn') {
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',encryptionKey(platform),iv);c.setAAD(context(id,platform));
  const body=Buffer.concat([c.update(value,'utf8'),c.final()]);
  return ['v1',iv.toString('base64url'),c.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function openKey(value,id,platform='daangn') {
  const [v,iv,tag,body]=value.split('.');if(v!=='v1')throw Error('암호화 버전 오류');
  const c=createDecipheriv('aes-256-gcm',encryptionKey(platform),Buffer.from(iv,'base64url'));c.setAAD(context(id,platform));c.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([c.update(Buffer.from(body,'base64url')),c.final()]).toString('utf8');
}
