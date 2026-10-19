import {privateAuth,privateJson} from '../../../../lib/workerPrivate';
import {auditMaterialCost} from '../../../../lib/materialCostAudit.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request) {
 try {
  const auth=await privateAuth(request,false);
  if(auth.error)return privateJson({error:auth.error},auth.status);
  const {db,user}=auth;
  const allowed=await db.from('super_admins').select('user_id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
  if(allowed.error)throw allowed.error;
  if(!allowed.data)return privateJson({error:'슈퍼관리자 권한이 필요합니다.'},403);
  const params=new URL(request.url).searchParams,company=params.get('company'),name=params.get('site');
  if(!/^[a-f0-9-]{36}$/i.test(company||'')||!name||name.length>200)return privateJson({error:'업체 ID와 현장명을 확인해주세요.'},400);
  const sites=await db.from('sites').select('id,site_name,company_id,status').eq('company_id',company).eq('site_name',name).limit(5);
  if(sites.error)throw sites.error;
  if(sites.data?.length!==1)return privateJson({error:'현장명이 없거나 중복됩니다. 정확한 현장명으로 조회해주세요.'},400);
  const site=sites.data[0];
  const rows=await db.from('site_materials').select('id,brand,product_code,product_name,unit,unit_price,film_product_id,material_type').eq('company_id',company).eq('site_id',site.id).eq('material_type','planned').limit(100);
  if(rows.error)throw rows.error;
  const materials=[];
  for(const row of rows.data||[])materials.push(await auditMaterialCost(db,company,row));
  return privateJson({site,materials});
 }catch(e){console.error('material cost audit',e.code||'failed');return privateJson({error:'현장 원가 진단을 조회하지 못했습니다.'},503);}
}
