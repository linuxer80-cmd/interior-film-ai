import { privateAuth, privateJson, uuid } from '../../../lib/workerPrivate';
import { publicDirectoryProfile } from '../../../lib/workerDirectory.mjs';
import { directoryBadges } from '../../../lib/publicAchievementBadge';

async function run(request, action, body) {
  const auth = await privateAuth(request, false);
  if (auth.error) return privateJson({error:auth.error},auth.status);
  if (auth.user.is_anonymous || !auth.user.email_confirmed_at) return privateJson({error:'이메일 인증 후 이용해주세요.'},403);
  const {data,error} = await auth.db.rpc('worker_directory_action',{p_actor:auth.user.id,p_action:action,p_body:body});
  if (error) {
    const missing = ['42883','42P01','PGRST202'].includes(error.code);
    return privateJson({error:missing ? '시공자 검색 기능의 데이터베이스 설정이 필요합니다.' : ['22023','42501','40001','P0001'].includes(error.code) ? error.message : '요청을 처리하지 못했습니다. 다시 시도해주세요.'},missing?503:error.code==='42501'?403:['22023','P0001'].includes(error.code)?400:error.code==='40001'?409:500);
  }
  if (action === 'search') {
    const rows=data?.profiles || [];
    const profiles=await Promise.all(rows.slice(0,30).map(async row=>{
      let photo_url=null;
      if(row.photo_path) {
        const signed=await auth.db.storage.from('labor-avatars').createSignedUrl(row.photo_path,300);
        photo_url=signed.data?.signedUrl || null;
      }
      return {...publicDirectoryProfile(row),photo_url};
    }));
    return privateJson({profiles:await directoryBadges(auth.db,profiles),hasMore:rows.length>30});
  }
  return privateJson(data);
}
export async function GET(request) {
  try {
    const q=new URL(request.url).searchParams;
    const action=q.get('mode') || 'mine';
    if(!['mine','sent','search'].includes(action)) return privateJson({error:'잘못된 요청입니다.'},400);
    const body={query:q.get('query')||'',region:q.get('region')||'',skill:q.get('skill')||'',page:Number(q.get('page')||0),experience:Number(q.get('experience')||0)};
    if(!Number.isInteger(body.page)||body.page<0||body.page>1000||!Number.isInteger(body.experience)||body.experience<0||body.experience>70) return privateJson({error:'검색 범위를 확인해주세요.'},400);
    return await run(request,action,body);
  } catch { return privateJson({error:'검색을 불러오지 못했습니다.'},500); }
}
export async function POST(request) {
  try {
    const raw=await request.text();
    if(raw.length>12000) return privateJson({error:'요청이 너무 큽니다.'},413);
    let body;
    try {body=JSON.parse(raw);} catch {return privateJson({error:'입력 내용을 확인해주세요.'},400);}
    if(!body || typeof body!=='object' || Array.isArray(body)) return privateJson({error:'잘못된 요청입니다.'},400);
    const action=body.action;
    if(!['consent','request','accept','decline','cancel'].includes(action)) return privateJson({error:'잘못된 요청입니다.'},400);
    if(action==='consent' && typeof body.visible!=='boolean') return privateJson({error:'공개 여부를 확인해주세요.'},400);
    if(action==='request' && (!uuid(body.target)||!['employee','freelancer'].includes(body.relationshipType)||typeof body.message!=='string'||body.message.length>300)) return privateJson({error:'연결 요청 내용을 확인해주세요.'},400);
    if(['accept','decline','cancel'].includes(action) && (!uuid(body.id)||!Number.isInteger(body.revision)||body.revision<1||(action==='accept' && body.consent!==true))) return privateJson({error:'요청 번호와 동의를 확인해주세요.'},400);
    return await run(request,action,body);
  } catch {return privateJson({error:'요청 처리 중 오류가 발생했습니다.'},500);}
}

