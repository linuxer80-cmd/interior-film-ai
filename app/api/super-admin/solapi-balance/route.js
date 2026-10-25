import {privateAuth,privateJson as json} from '../../../../lib/workerPrivate';
import {readSolapiBalance} from '../../../../lib/solapiBalance.mjs';
export const runtime='nodejs';
export async function GET(request){
 try{
  const auth=await privateAuth(request,false);if(auth.error)return json({error:auth.error},auth.status);
  const admin=await auth.db.from('super_admins').select('user_id').eq('user_id',auth.user.id).eq('is_active',true).maybeSingle();
  if(admin.error)return json({error:'슈퍼관리자 권한을 확인하지 못했습니다.'},503);
  if(!admin.data)return json({error:'슈퍼관리자 권한이 필요합니다.'},403);
  return json(await readSolapiBalance());
 }catch{return json({error:'솔라피 잔액을 조회하지 못했습니다.'},503);}
}
