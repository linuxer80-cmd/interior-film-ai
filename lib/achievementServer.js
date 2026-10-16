import {privateAuth,privateJson} from './workerPrivate';
export {privateJson};
export async function achievementAuth(request,superOnly=false){
 const auth=await privateAuth(request,false);
 if(auth.error)return auth;
 if(auth.user.is_anonymous||!auth.user.email_confirmed_at)return {error:'이메일 인증 후 이용해주세요.',status:403};
 if(superOnly){
  const r=await auth.db.from('super_admins').select('user_id').eq('user_id',auth.user.id).eq('is_active',true).maybeSingle();
  if(r.error)throw r.error;
  if(!r.data)return {error:'슈퍼관리자만 배지를 관리할 수 있습니다.',status:403};
 }
 return auth;
}
export function badgeImageUrl(db,path){return path?db.storage.from('achievement-badges').getPublicUrl(path).data.publicUrl:null;}
export async function achievementResult(auth,action,body){
 const {data,error}=await auth.db.rpc('achievement_action',{p_actor:auth.user.id,p_action:action,p_body:body});
 if(error){
  const missing=['42P01','42883','PGRST202'].includes(error.code);
  return privateJson({error:missing?'업적 기능의 데이터베이스 설정이 필요합니다.':['22023','40001','42501'].includes(error.code)?error.message:'업적 정보를 처리하지 못했습니다.'},missing?503:error.code==='42501'?403:error.code==='40001'?409:400);
 }
 return privateJson({...data,...(data.badges?{badges:data.badges.map(b=>({...b,image_url:badgeImageUrl(auth.db,b.image_path)}))}:{})});
}
