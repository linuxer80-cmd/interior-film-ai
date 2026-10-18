import { privateAuth, privateJson, uuid } from '../../../../lib/workerPrivate';
import { resolveWorkerSite } from '../../../../lib/workerSiteAccess.mjs';
import { authorizedTeam, teamDate, teamMessage } from '../../../../lib/workerTeam.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function context(request){
  const auth=await privateAuth(request,false);if(auth.error)throw Object.assign(Error(auth.error),{status:auth.status});
  const url=new URL(request.url),siteId=url.searchParams.get('siteId'),date=teamDate(url.searchParams.get('date'));
  const {site}=await resolveWorkerSite(auth.db,auth.user.id,siteId);
  if(site.status==='cancelled'||(Array.isArray(site.work_dates)&&!site.work_dates.includes(date)))throw Object.assign(Error('유효한 배정 날짜가 아닙니다.'),{status:403});
  const a=await auth.db.from('site_daily_assignments').select('worker_id,company_id,site_id,work_date,role').eq('company_id',site.company_id).eq('site_id',site.id).eq('work_date',date);
  if(a.error)throw a.error;
  const ids=[...new Set((a.data||[]).map(x=>x.worker_id))];
  const w=ids.length?await auth.db.from('workers').select('id,user_id,company_id,name,phone,is_active').eq('company_id',site.company_id).in('id',ids):{data:[]};
  if(w.error)throw w.error;
  const members=authorizedTeam(a.data||[],w.data||[],auth.user.id,site.company_id,site.id,date);
  return {...auth,site,date,members,url};
}
function failure(e){return privateJson({error:e.status?e.message:['42P01','PGRST205'].includes(e.code)?'팀원 채팅 설정 SQL을 먼저 실행해주세요.':'팀원 정보를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'},e.status||500);}
export async function GET(request){try{
  const a=await context(request);
  const users=[...new Set(a.members.map(w=>w.user_id).filter(Boolean))];
  const profiles=users.length?await a.db.from('labor_profiles').select('user_id,name,region,skills,experience_years,introduction,photo_path').in('user_id',users):{data:[]};
  if(profiles.error)throw profiles.error;
  const members=await Promise.all(a.members.map(async w=>{
    const p=(profiles.data||[]).find(p=>p.user_id===w.user_id);let photoUrl=null;
    if(p?.photo_path){const signed=await a.db.storage.from('labor-avatars').createSignedUrl(p.photo_path,300);photoUrl=signed.data?.signedUrl||null;}
    return {id:w.id,user_id:w.user_id,name:p?.name||w.name,phone:w.phone,role:w.role,profile:p?{region:p.region,skills:p.skills,experience_years:p.experience_years,introduction:p.introduction,photoUrl}:null};
  }));
  let q=a.db.from('worker_team_messages').select('id,sender_id,body,created_at').eq('company_id',a.site.company_id).eq('site_id',a.site.id).eq('work_date',a.date).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
  const result=await q;
  if(result.error&& !['42P01','PGRST205'].includes(result.error.code))throw result.error;
  return privateJson({members,messages:(result.data||[]).reverse(),userId:a.user.id,chatReady:!result.error,notice:result.error?'팀원 채팅 설정 SQL을 먼저 실행해주세요.':null});
}catch(e){return failure(e);}}
export async function POST(request){try{
  const a=await context(request);
  const raw=await request.text();if(raw.length>12000)throw Object.assign(Error('메시지가 너무 깁니다.'),{status:400});
  let input;try{input=JSON.parse(raw);}catch{throw Object.assign(Error('메시지를 확인해주세요.'),{status:400});}
  if(!uuid(input.id))throw Object.assign(Error('요청 번호를 확인해주세요.'),{status:400});
  const body=teamMessage(input.body);
  const r=await a.db.from('worker_team_messages').insert({id:input.id,company_id:a.site.company_id,site_id:a.site.id,work_date:a.date,sender_id:a.user.id,body});
  if(r.error){if(r.error.code!=='23505')throw r.error;const old=await a.db.from('worker_team_messages').select('sender_id,site_id,work_date,body').eq('id',input.id).single();if(old.error||old.data.sender_id!==a.user.id||old.data.site_id!==a.site.id||old.data.work_date!==a.date||old.data.body!==body)throw Object.assign(Error('중복 요청 정보가 다릅니다.'),{status:409});}
  return privateJson({ok:true});
}catch(e){return failure(e);}}
