import { privateAuth, privateJson as json, uuid } from '../../../lib/workerPrivate';
export const runtime = 'nodejs';

export async function POST(request) {
 try {
  const auth = await privateAuth(request, false);
  if (auth.error) return json({error:auth.error},auth.status);
  const {db,user}=auth;
  if(user.is_anonymous || !user.email_confirmed_at) return json({error:'이메일 인증 후 이용해주세요.'},403);
  const body=await request.json();
  if(!['list','mine','invite','preview','accept','decline','approve','cancel','end','set_type'].includes(body.action)) return json({error:'요청을 확인해주세요.'},400);
  if(['invite','end'].includes(body.action)&&!uuid(body.workerId)) return json({error:'시공자를 확인해주세요.'},400);
  if(['preview','accept','decline','approve','cancel'].includes(body.action)&&!uuid(body.code)) return json({error:'초대 링크를 확인해주세요.'},400);
  if(body.action==='set_type') {
   if(!uuid(body.workerId)||!['employee','freelancer'].includes(body.relationshipType)) return json({error:'시공자와 관계 유형을 확인해주세요.'},400);
   const {data,error}=await db.rpc('set_worker_relationship_type',{p_actor:user.id,p_worker:body.workerId,p_type:body.relationshipType});
   if(error){
    if(['PGRST202','42883'].includes(error.code))return json({error:'관계 설정 DB 마이그레이션을 먼저 적용해주세요.',setupRequired:true},503);
    if(error.code==='P0001')return json({error:error.message},409);
    console.error('시공자 관계 설정:',error.code);return json({error:'관계 설정에 실패했습니다.'},503);
   }
   return json(data);
  }
  const {data,error}=await db.rpc('worker_relationship_action',{
   p_actor:user.id,p_action:body.action,p_body:{workerId:body.workerId,code:body.code,relationshipType:body.relationshipType,verifiedEmail:user.email}
  });
  if(error) {
   if(['PGRST202','42883','42P01'].includes(error.code)) return json({error:'직원·협력 연결 기능의 DB 적용이 필요합니다.',setupRequired:true},503);
   if(error.code==='P0001') return json({error:error.message},409);
   console.error('시공자 관계 처리:',error.code);
   return json({error:'처리하지 못했습니다. 다시 확인해주세요.'},503);
  }
  return json(data);
 } catch {return json({error:'요청을 처리하지 못했습니다.'},400);}
}
