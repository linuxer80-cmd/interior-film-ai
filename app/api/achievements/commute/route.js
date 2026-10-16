import {achievementAuth,privateJson} from '../../../../lib/achievementServer';
import {syncBadgeCommute} from '../../../../lib/workerBadgeCommute.mjs';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request){
 try{
  const auth=await achievementAuth(request);
  if(auth.error)return privateJson({error:auth.error},auth.status);
  return privateJson(await syncBadgeCommute(auth.db,auth.user.id));
 }catch(error){return privateJson({error:error.message||'거리 계산에 실패했습니다.'},503);}
}

