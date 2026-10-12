import {privateAuth,privateJson as json,uuid} from '../../../../lib/workerPrivate';
import {workerDirectory,filterDirectory} from '../../../../lib/superWorkerDirectory.mjs';
export const runtime='nodejs';
export const maxDuration=60;
async function auth(request){
 const result=await privateAuth(request,false);
 if(result.error)throw Object.assign(Error(result.error),{status:result.status});
 const {data,error}=await result.db.from('super_admins').select('user_id').eq('user_id',result.user.id).eq('is_active',true).maybeSingle();
 if(error)throw error;if(!data)throw Object.assign(Error('슈퍼관리자 권한이 필요합니다.'),{status:403});
 return result;
}
async function all(db,table,fields,order){
 const rows=[];
 for(let start=0;start<50000;start+=500){
  const {data,error}=await db.from(table).select(fields).order(order).range(start,start+499);
  if(error)throw error;rows.push(...data);if(data.length<500)return rows;
 }
 throw Error('directory limit');
}
function errorResponse(e){console.error('super worker directory:',e.code||e.status||'request failed');return json({error:e.status?e.message:'시공자 정보를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.'},e.status||503);}
export async function GET(request){
 try{
  const {db}=await auth(request);
  const params=new URL(request.url).searchParams;
  const page=Number(params.get('page')||1),kind=params.get('kind')||'account',status=params.get('status')||'all',query=params.get('q')||'',company=params.get('company')||'';
  if(!Number.isInteger(page)||page<1||page>2500||!['account','unlinked','pending'].includes(kind)||!['all','seeking','published','private','incomplete','inactive'].includes(status)||query.length>100||(company&&!uuid(company)))return json({error:'조회 조건을 확인해주세요.'},400);
  const tasks=await Promise.all([
   all(db,'profiles','id,name,role,company_id,is_active','id'),
   all(db,'labor_profiles','user_id,name,daily_wage,region,skills,experience_years,introduction,published,seeking,updated_at','user_id'),
   all(db,'workers','id,user_id,company_id,name,phone,is_active,created_at','id'),
   all(db,'companies','id,company_name,is_active','id'),
   all(db,'labor_personal_details','user_id,phone','user_id'),
   all(db,'super_admins','user_id','user_id'),
   all(db,'worker_relationships','worker_id,user_id,relationship_type,ended_at','worker_id').catch(e=>{if(['42P01','PGRST205'].includes(e.code))return null;throw e;})
  ]);
  const [profiles,labor,workers,companies,personal,superAdmins,relationships]=tasks;
  const users=[];
  for(let n=1;n<=100;n++){
   const {data,error}=await db.auth.admin.listUsers({page:n,perPage:200});
   if(error)throw error;users.push(...data.users);
   if(data.users.length<200)break;
   if(n===100)throw Error('user directory limit');
  }
  const directory=workerDirectory({users,profiles,labor,workers,companies,personal,superAdmins,relationships:relationships||[]});
  const filtered=filterDirectory(directory,{kind,status,query,company});
  const currentPage=Math.min(page,Math.max(1,Math.ceil(filtered.length/20)));
  const items=filtered.slice((currentPage-1)*20,currentPage*20);
  return json({items,total:filtered.length,page:currentPage,pageSize:20,summary:{accounts:directory.accounts.length,unlinked:directory.unlinked.length,pending:directory.pending.length,seeking:directory.accounts.filter(r=>r.seeking).length},companies,relationshipsAvailable:relationships!==null});
 }catch(e){return errorResponse(e);}
}
export async function POST(request){
 try{
  const {db}=await auth(request),body=await request.json();
  if(body.action!=='unpublish'||!uuid(body.userId)||typeof body.revision!=='string'||!Number.isFinite(Date.parse(body.revision)))return json({error:'대상과 요청을 확인해주세요.'},400);
  const {data,error}=await db.from('labor_profiles').update({published:false,seeking:false,direct_hire_consent:false,updated_at:new Date().toISOString()}).eq('user_id',body.userId).eq('updated_at',body.revision).select('user_id').maybeSingle();
  if(error)throw error;if(!data)return json({error:'프로필이 변경되었습니다. 새로고침 후 다시 확인해주세요.'},409);
  return json({ok:true});
 }catch(e){return errorResponse(e);}
}
