import { privateAuth, privateJson, uuid } from '../../../lib/workerPrivate';
import { resolveTeamSite } from '../../../lib/teamSiteAccess.mjs';
import { extraAmount, extraDescription, imageType } from '../../../lib/siteExtraWork.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const fail=e=>privateJson({error:e.status||['22023','42501','40001'].includes(e.code)?e.message:['42P01','PGRST205','PGRST202'].includes(e.code)?'추가 작업 설정 SQL을 먼저 실행해주세요.':'추가 작업을 처리하지 못했습니다. 다시 시도해주세요.'},e.status||(e.code==='42501'?403:e.code==='40001'?409:e.code==='22023'?400:500));
async function auth(request){const a=await privateAuth(request,false);if(a.error)throw Object.assign(Error(a.error),{status:a.status});return a;}
async function signed(db,rows){return Promise.all(rows.map(async row=>{
 const photos=await Promise.all((row.photo_paths||[]).map(async path=>{
  if(!path.startsWith(`extra-work/${row.company_id}/${row.site_id}/`))return null;
  const r=await db.storage.from('work-photos').createSignedUrl(path,300);
  return r.error?null:r.data.signedUrl;
 }));
 const {photo_paths,...safe}=row;return {...safe,photos:photos.filter(Boolean),photoCount:photo_paths?.length||0};
}));}
export async function GET(request){try{
 const a=await auth(request),url=new URL(request.url),siteId=url.searchParams.get('siteId');
 let owner=false,site=null,companyId;
 if(siteId){const access=await resolveTeamSite(a.db,a.user.id,siteId);site=access.site;owner=access.ownerAccess;companyId=site.company_id;}
 else {const o=await privateAuth(request,true);if(o.error)throw Object.assign(Error(o.error),{status:o.status});owner=true;companyId=o.companyId;}
 const page=Number(url.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>10000)throw Object.assign(Error('페이지를 확인해주세요.'),{status:400});
 let q=a.db.from('site_extra_work').select('*',{count:'exact'}).eq('company_id',companyId);
 q=site?q.eq('site_id',site.id):q.eq('status','pending');
 if(site&&url.searchParams.get('approved')==='true')q=q.eq('status','approved');
 const r=await q.order('created_at',{ascending:false}).order('id').range(page*50,page*50+49);if(r.error)throw r.error;
 const rows=site&&url.searchParams.get('approved')!=='true'?await signed(a.db,r.data||[]):(r.data||[]).map(({photo_paths,...row})=>({...row,photos:[],photoCount:photo_paths?.length||0}));
 if(!site&&rows.length){const ids=[...new Set(rows.map(row=>row.site_id))];const names=await a.db.from('sites').select('id,site_name,customer_name').eq('company_id',companyId).in('id',ids);if(names.error)throw names.error;const map=new Map((names.data||[]).map(s=>[s.id,s.site_name||s.customer_name||'현장']));for(const row of rows)row.siteName=map.get(row.site_id)||'현장';}
 let contractAmount=null;
 if(owner&&site){const s=await a.db.from('sites').select('contract_amount').eq('company_id',companyId).eq('id',site.id).single();if(s.error)throw s.error;contractAmount=s.data.contract_amount;}
 return privateJson({owner,userId:a.user.id,rows,count:r.count,contractAmount});
}catch(e){return fail(e);}}
export async function POST(request){let a,uploaded=[];try{
 a=await auth(request);
 if(Number(request.headers.get('content-length')||0)>4*1024*1024)throw Object.assign(Error('사진 크기를 줄여주세요.'),{status:400});
 const multipart=request.headers.get('content-type')?.includes('multipart/form-data');
 const form=multipart?await request.formData():null;
 const body=multipart?Object.fromEntries(form.entries()):await request.json();
 if(!uuid(body.siteId))throw Object.assign(Error('현장을 확인해주세요.'),{status:400});
 const access=await resolveTeamSite(a.db,a.user.id,body.siteId),site=access.site;
 if(body.action==='create'){
  if(site.status==='cancelled')throw Object.assign(Error('취소된 현장에는 요청할 수 없습니다.'),{status:409});
  if(!uuid(body.requestId))throw Object.assign(Error('요청 번호를 확인해주세요.'),{status:400});
  const description=extraDescription(body.description),requested_amount=extraAmount(body.amount);
  const prior=await a.db.from('site_extra_work').select('id').eq('company_id',site.company_id).eq('site_id',site.id).eq('requested_by',a.user.id).eq('request_id',body.requestId).maybeSingle();if(prior.error)throw prior.error;
  if(prior.data)return privateJson({success:true,id:prior.data.id});
  const files=form?.getAll('photos')||[];
  if(files.length>5||files.some(f=>typeof f.arrayBuffer!=='function'||f.size===0)||files.reduce((n,f)=>n+f.size,0)>3*1024*1024)throw Object.assign(Error('사진은 최대 5장, 합계 3MB 이하로 등록해주세요.'),{status:400});
  const prepared=[];for(const f of files){const bytes=new Uint8Array(await f.arrayBuffer());prepared.push({bytes,type:imageType(bytes)});}
  for(const f of prepared){const path=`extra-work/${site.company_id}/${site.id}/${a.user.id}/${crypto.randomUUID()}.${f.type[1]}`;const r=await a.db.storage.from('work-photos').upload(path,f.bytes,{contentType:f.type[0],upsert:false});if(r.error)throw r.error;uploaded.push(path);}
  const r=await a.db.from('site_extra_work').insert({company_id:site.company_id,site_id:site.id,requested_by:a.user.id,request_id:body.requestId,description,requested_amount,photo_paths:uploaded}).select('id').single();
  if(r.error){if(r.error.code==='23505'){const winner=await a.db.from('site_extra_work').select('id').eq('company_id',site.company_id).eq('site_id',site.id).eq('requested_by',a.user.id).eq('request_id',body.requestId).single();if(!winner.error){if(uploaded.length)await a.db.storage.from('work-photos').remove(uploaded);uploaded=[];return privateJson({success:true,id:winner.data.id});}}throw r.error;}
  uploaded=[];return privateJson({success:true,id:r.data.id});
 }
 if(!['approve','reject','cancel'].includes(body.action)||!uuid(body.id))throw Object.assign(Error('요청을 확인해주세요.'),{status:400});
 if(body.action!=='cancel'&&!access.ownerAccess)throw Object.assign(Error('본인 업체 관리자만 승인할 수 있습니다.'),{status:403});
 const note=typeof body.note==='string'?body.note.trim():'';
 if(note.length>1000||(body.action==='reject'&&!note))throw Object.assign(Error('검토 메모·반려 사유를 1000자 이하로 입력해주세요.'),{status:400});
 const r=await a.db.rpc('review_site_extra_work',{p_user:a.user.id,p_site:site.id,p_id:body.id,p_action:body.action,p_amount:body.action==='approve'?extraAmount(body.amount,true):null,p_note:note});if(r.error)throw r.error;
 return privateJson(r.data);
}catch(e){if(e instanceof SyntaxError)e.status=400;if(uploaded.length&&a)await a.db.storage.from('work-photos').remove(uploaded).catch(()=>{});return fail(e);}}
