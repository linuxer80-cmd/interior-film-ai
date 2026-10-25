import {after} from 'next/server';
import {privateAuth,privateJson as json,uuid} from '../../../../lib/workerPrivate';
import {notifyWorkerChangeAlerts} from '../../../../lib/workerChangeAlimtalk.mjs';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(request){
 const auth=await privateAuth(request);if(auth.error)return json({error:auth.error},auth.status);
 let body;try{body=await request.json();}catch{return json({error:'현장을 확인해주세요.'},400);}
 if(!uuid(body.siteId))return json({error:'현장을 확인해주세요.'},400);
 const site=await auth.db.from('sites').select('id').eq('id',body.siteId).eq('company_id',auth.companyId).maybeSingle();
 if(site.error)return json({error:'현장을 확인하지 못했습니다.'},503);if(!site.data)return json({error:'현장을 찾을 수 없습니다.'},404);
 after(()=>notifyWorkerChangeAlerts(auth.db,auth.companyId,body.siteId,auth.user.id));return json({queued:true});
}
