import { createHash } from 'node:crypto';
import { privateAuth, privateJson as json, uuid } from '../../../../lib/workerPrivate';
import { preparePlannedMaterials } from '../../../../lib/preparePlannedMaterials.mjs';
import { normalizeSupplement, consultationSupplement } from '../../../../lib/consultationSupplement.mjs';

export const runtime='nodejs';
export async function POST(request) {
  try {
    const auth=await privateAuth(request);
    if(auth.error)return json({error:auth.error},auth.status);
    let body;
    try {body=await request.json();} catch {return json({error:'입력 형식을 확인해주세요.'},400);}
    if(!uuid(body?.siteId) || !uuid(body?.requestId))return json({error:'현장과 저장 요청을 확인해주세요.'},400);
    const data=normalizeSupplement(body.data);
    const materials=body.materials || [];
    if(!Array.isArray(materials) || materials.length>60)return json({error:'자재는 60개까지 추가할 수 있습니다.'},400);
    const fingerprint=createHash('sha256').update(JSON.stringify({siteId:body.siteId,data,materials})).digest('hex');
    const {data:site,error:readError}=await auth.db.from('sites').select('*').eq('id',body.siteId).eq('company_id',auth.companyId).maybeSingle();
    if(readError)throw readError;
    if(!site)return json({error:'소속 현장을 찾을 수 없습니다.'},404);
    const prepared=await preparePlannedMaterials(auth.db,auth.companyId,materials);
    const change=consultationSupplement(site,data);
    const {data:result,error}=await auth.db.rpc('supplement_site_consultation',{
      p_user:auth.user.id,p_site:site.id,p_request:body.requestId,p_expected:site.updated_at,
      p_patch:change.patch,p_materials:prepared,p_fingerprint:fingerprint,
    });
    if(error)throw error;
    return json({...result,filled:change.filled,conflicts:change.conflicts});
  } catch(error) {
    const status=error.status || (error.code==='42501'?403:['40001','23505'].includes(error.code)?409:['22023','22P02'].includes(error.code)?400:500);
    if(status===500)console.error('추가 상담 저장 실패:',error.code || 'unknown');
    return json({error:status===500?'상담을 저장하지 못했습니다. 입력을 유지한 채 다시 저장해주세요.':error.message},status);
  }
}
