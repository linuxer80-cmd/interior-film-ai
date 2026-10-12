import {supabase} from './supabase';
export async function relationshipRequest(body) {
 const {data}=await supabase.auth.getSession();
 if(!data.session) throw Error('먼저 로그인해주세요.');
 const response=await fetch('/api/worker-relationships',{
  method:'POST',cache:'no-store',signal:AbortSignal.timeout(20000),
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify(body)
 });
 const result=await response.json();
 if(!response.ok) throw Object.assign(Error(result.error||'요청 실패'),{setupRequired:result.setupRequired});
 return result;
}
export const relationshipLabel=type=>type==='employee'?'업체 소속 직원':'협력 시공자·프리랜서';
