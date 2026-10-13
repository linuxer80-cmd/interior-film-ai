import { privateAuth, privateJson as json, uuid } from "../../../lib/workerPrivate";
export const runtime = "nodejs";
export async function POST(request) {
 try {
  const auth=await privateAuth(request,false);
  if(auth.error)return json({error:auth.error},auth.status);
  const {db,user}=auth;
  if(user.is_anonymous || !user.email_confirmed_at)return json({error:"이메일 인증이 필요합니다."},403);
  const body=await request.json();
  const action=body?.action;
  if(!["create","list","preview","accept","decline"].includes(action))return json({error:"잘못된 요청입니다."},400);
  if(["preview","accept","decline"].includes(action) && !uuid(body.code))return json({error:"초대 코드가 올바르지 않습니다."},400);
  if(action==="create" && !["employee","freelancer"].includes(body.relationshipType))return json({error:"관계 유형을 선택해주세요."},400);
  const {data,error}=await db.rpc("direct_worker_invite_action",{
   p_actor:user.id,p_action:action,p_code:body.code||null,p_type:body.relationshipType||null
  });
  if(error){
   if(["PGRST202","42883","42P01"].includes(error.code))return json({error:"초대 기능 SQL을 먼저 적용해주세요.",setupRequired:true},503);
   if(error.code==="P0001")return json({error:error.message},409);
   console.error("direct invite",error.code,error.message);
   return json({error:"초대 요청에 실패했습니다. 오류 코드: "+(error.code||"UNKNOWN")},503);
  }
  return json(data);
 }catch(error){console.error("direct invite request",error);return json({error:"요청을 처리하지 못했습니다."},400);}
}
