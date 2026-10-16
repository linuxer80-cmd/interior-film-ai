import {achievementAuth,privateJson as json} from '../../../../lib/achievementServer';
import {GET as workerContext} from '../../worker/my-sites/route';
import {recordWorkerActivity} from '../../../../lib/workerActivity.mjs';
export const runtime='nodejs';
export async function POST(request){
 try{
  const auth=await achievementAuth(request);
  if(auth.error)return json({error:auth.error},auth.status);
  const raw=await request.text();
  if(raw.length>2000)return json({error:'요청이 너무 큽니다.'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'요청을 확인해주세요.'},400);}
  // Browser-side optimizer reports completion, not a certified installation.
  // Only this feature is accepted from clients; search events are server-owned.
  if(body?.feature!=='cutting'||!Number.isInteger(body.usedRollCount)||body.usedRollCount<1||body.usedRollCount>10000
   ||!Number.isInteger(body.totalBatchCount)||body.totalBatchCount<1||body.totalBatchCount>100000){
   return json({error:'완료된 재단 계산을 확인해주세요.'},400);
  }
  const url=new URL('/api/worker/my-sites',request.url);
  if(body.siteId)url.searchParams.set('siteId',body.siteId);
  else url.searchParams.set('profileOnly','1');
  const access=await workerContext(new Request(url,{headers:request.headers}));
  if(!access.ok)return access;
  const ok=await recordWorkerActivity(auth.db,auth.user.id,'cutting');
  return json(ok?{ok:true}:{error:'재단은 완료됐지만 배지 기록을 저장하지 못했습니다.'},ok?200:503);
 }catch{return json({error:'배지 사용 기록을 저장하지 못했습니다.'},503);}
}
