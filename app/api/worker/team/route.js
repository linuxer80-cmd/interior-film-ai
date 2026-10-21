import { after } from 'next/server';
import { dispatchTeamMessage } from '../../../../lib/workerTeamPush.mjs';
import { privateAuth, privateJson, uuid } from '../../../../lib/workerPrivate';
import { resolveTeamSite } from '../../../../lib/teamSiteAccess.mjs';
import { authorizedTeam, includeTeamOwners, teamDate, teamMessage } from '../../../../lib/workerTeam.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function context(request){
  const auth=await privateAuth(request,false);if(auth.error)throw Object.assign(Error(auth.error),{status:auth.status});
  const url=new URL(request.url),siteId=url.searchParams.get('siteId');
  const {site,ownerAccess}=await resolveTeamSite(auth.db,auth.user.id,siteId);
  if(url.searchParams.get('mode')==='dates'){
   if(!ownerAccess)throw Object.assign(Error('본인 업체 관리자만 조회할 수 있습니다.'),{status:403});
   const dates=new Set((Array.isArray(site.work_dates)?site.work_dates:[]));
   for(const table of ['site_daily_assignments','worker_team_messages']){
    for(let offset=0;offset<10000;offset+=500){
     const r=await auth.db.from(table).select('id,work_date').eq('company_id',site.company_id).eq('site_id',site.id).order('id').range(offset,offset+499);
     if(r.error)throw r.error;for(const row of r.data||[])dates.add(row.work_date);
     if((r.data||[]).length<500)break;
     if(offset===9500)throw Error('채팅 날짜 조회 범위를 초과했습니다.');
    }
   }
   if(!dates.size && site.schedule_start){
    const day=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(d):null;};
    const start=day(site.schedule_start),end=day(site.schedule_end||site.schedule_start);
    if(start&&end&&start<=end){
     const count=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;
     if(count>3660)throw Error('현장 일정 범위를 확인해주세요.');
     for(let i=0;i<count;i++)dates.add(new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10));
    }
   }
   if(!dates.size)dates.add(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()));
   return {...auth,site,url,dates:[...dates].filter(Boolean).sort().map(work_date=>({work_date}))};
  }
  const date=teamDate(url.searchParams.get('date'));
  if(!ownerAccess&&(site.status==='cancelled'||(Array.isArray(site.work_dates)&&!site.work_dates.includes(date))))throw Object.assign(Error('유효한 배정 날짜가 아닙니다.'),{status:403});
  const a=await auth.db.from('site_daily_assignments').select('worker_id,company_id,site_id,work_date,role').eq('company_id',site.company_id).eq('site_id',site.id).eq('work_date',date);
  if(a.error)throw a.error;
  const ids=[...new Set((a.data||[]).map(x=>x.worker_id))];
  const w=ids.length?await auth.db.from('workers').select('id,user_id,company_id,name,phone,is_active').eq('company_id',site.company_id).in('id',ids):{data:[]};
  if(w.error)throw w.error;
  const team=authorizedTeam(a.data||[],w.data||[],auth.user.id,site.company_id,site.id,date,ownerAccess);
  const owners=await auth.db.from('profiles').select('id,company_id,role,is_active,name').eq('company_id',site.company_id).eq('role','owner');
  if(owners.error)throw owners.error;
  const members=includeTeamOwners(team,owners.data||[],site.company_id);
  return {...auth,site,date,members,url};
}
function failure(e){return privateJson({error:e.status?e.message:['42P01','PGRST205'].includes(e.code)?'팀원 채팅 설정 SQL을 먼저 실행해주세요.':'팀원 정보를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'},e.status||500);}
export async function GET(request){try{
  const a=await context(request);
  if(a.dates)return privateJson({dates:a.dates});
  const users=[...new Set(a.members.map(w=>w.user_id).filter(Boolean))];
  const profiles=users.length?await a.db.from('labor_profiles').select('user_id,name,region,skills,experience_years,introduction,photo_path').in('user_id',users):{data:[]};
  if(profiles.error)throw profiles.error;
  const members=await Promise.all(a.members.map(async w=>{
    const p=(profiles.data||[]).find(p=>p.user_id===w.user_id);let photoUrl=null;
    if(p?.photo_path){const signed=await a.db.storage.from('labor-avatars').createSignedUrl(p.photo_path,300);photoUrl=signed.data?.signedUrl||null;}
    return {id:w.id,user_id:w.user_id,name:p?.name||w.name,phone:w.phone,role:w.role,assignment_role:w.assignment_role,profile:p?{region:p.region,skills:p.skills,experience_years:p.experience_years,introduction:p.introduction,photoUrl}:null};
  }));
  let q=a.db.from('worker_team_messages').select('id,sender_id,body,created_at').eq('company_id',a.site.company_id).eq('site_id',a.site.id).eq('work_date',a.date).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
  const result=await q;
  if(result.error&& !['42P01','PGRST205'].includes(result.error.code))throw result.error;
  const ids=(result.data||[]).map(m=>m.id);
  const reads=ids.length ? await a.db.rpc('team_message_read_counts',{p_ids:ids}) : {data:[]};
  if(reads.error && !['PGRST202','42883','42P01','PGRST205'].includes(reads.error.code))throw reads.error;
  const counts=new Map((reads.data||[]).map(row=>[row.message_id,Number(row.unread_count)]));
  const messages=(result.data||[]).reverse().map(m=>({...m,unreadCount:reads.error?null:counts.get(m.id)||0}));
  return privateJson({members,messages,userId:a.user.id,readReady:!reads.error,chatReady:!result.error,notice:result.error?'팀원 채팅 설정 SQL을 먼저 실행해주세요.':null});
}catch(e){return failure(e);}}
export async function POST(request){try{
  const a=await context(request);
  if(a.dates)throw Object.assign(Error('메시지 날짜를 선택해주세요.'),{status:400});
  const raw=await request.text();if(raw.length>12000)throw Object.assign(Error('메시지가 너무 깁니다.'),{status:400});
  let input;try{input=JSON.parse(raw);}catch{throw Object.assign(Error('메시지를 확인해주세요.'),{status:400});}
  if(!uuid(input.id))throw Object.assign(Error('요청 번호를 확인해주세요.'),{status:400});
  const body=teamMessage(input.body);
  const r=await a.db.from('worker_team_messages').insert({id:input.id,company_id:a.site.company_id,site_id:a.site.id,work_date:a.date,sender_id:a.user.id,body});
  if(r.error){if(r.error.code!=='23505')throw r.error;const old=await a.db.from('worker_team_messages').select('sender_id,site_id,work_date,body').eq('id',input.id).single();if(old.error||old.data.sender_id!==a.user.id||old.data.site_id!==a.site.id||old.data.work_date!==a.date||old.data.body!==body)throw Object.assign(Error('중복 요청 정보가 다릅니다.'),{status:409});}
  // Only a newly persisted message schedules push. Retrying the same message ID
  // does not send another notification, and push errors never undo the message.
  if (!r.error) after(async () => {
    try {
      const delivery = await dispatchTeamMessage(a.db, {
        members: a.members, senderId: a.user.id, siteId: a.site.id,
        date: a.date, messageId: input.id, body,
      });
      if (delivery.state === 'unconfigured' || delivery.failed || delivery.unsubscribed || delivery.expired)
        console.warn('Team chat push delivery', delivery);
    } catch { console.error('Team chat push dispatch failed'); }
  });
  return privateJson({ok:true});
}catch(e){return failure(e);}}


export async function PATCH(request){try{
 const a=await context(request);
 if(a.dates)throw Object.assign(Error('메시지 날짜를 선택해주세요.'),{status:400});
 const raw=await request.text();if(raw.length>6000)throw Object.assign(Error('읽음 요청이 너무 큽니다.'),{status:400});
 let input;try{input=JSON.parse(raw);}catch{throw Object.assign(Error('읽음 요청을 확인해주세요.'),{status:400});}
 if(!Array.isArray(input.messageIds)||!input.messageIds.length||input.messageIds.length>100||!input.messageIds.every(uuid))throw Object.assign(Error('메시지 번호를 확인해주세요.'),{status:400});
 const result=await a.db.rpc('mark_team_messages_read',{p_user:a.user.id,p_company:a.site.company_id,p_site:a.site.id,p_date:a.date,p_ids:[...new Set(input.messageIds)]});
 if(result.error){if(['PGRST202','42883','42P01','PGRST205'].includes(result.error.code))return privateJson({error:'팀 채팅 읽음 설정 SQL을 먼저 적용해주세요.'},503);throw result.error;}
 return privateJson({ok:true});
}catch(e){return failure(e);}}
