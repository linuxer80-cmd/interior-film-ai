import {achievementAuth,achievementResult,privateJson} from '../../../lib/achievementServer';
export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const auth=await achievementAuth(request);if(auth.error)return privateJson({error:auth.error},auth.status);
  const scope=new URL(request.url).searchParams.get('scope');
  if(!['owner','worker'].includes(scope))return privateJson({error:'업적 대상을 확인해주세요.'},400);
  return await achievementResult(auth,'get',{scope});
 }catch{return privateJson({error:'업적을 불러오지 못했습니다.'},503);}
}
export async function POST(request){
 try{
  const auth=await achievementAuth(request);if(auth.error)return privateJson({error:auth.error},auth.status);
  const raw=await request.text();if(raw.length>40000)return privateJson({error:'요청이 너무 큽니다.'},413);
  let b;try{b=JSON.parse(raw);}catch{return privateJson({error:'입력 형식을 확인해주세요.'},400);}
  if(!b||!['owner','worker'].includes(b.scope)||!['feature','seen'].includes(b.action))return privateJson({error:'잘못된 요청입니다.'},400);
  if(b.action==='feature'&&b.badge_id!==null&&(typeof b.badge_id!=='string'||b.badge_id.length>64))return privateJson({error:'배지를 선택해주세요.'},400);
  if(b.action==='seen'&&(!Array.isArray(b.badge_ids)||b.badge_ids.length>500||b.badge_ids.some(id=>typeof id!=='string'||id.length>64)))return privateJson({error:'배지 목록을 확인해주세요.'},400);
  return await achievementResult(auth,b.action,{scope:b.scope,badge_id:b.badge_id,badge_ids:b.badge_ids});
 }catch{return privateJson({error:'업적을 저장하지 못했습니다.'},503);}
}
