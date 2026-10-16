import { achievementAuth, privateJson } from '../../../lib/achievementServer';
export const dynamic = 'force-dynamic';
export async function POST(request) {
 try {
  const auth = await achievementAuth(request);
  if (auth.error) return privateJson({error:auth.error},auth.status);
  const raw = await request.text();
  if(raw.length>2000) return privateJson({error:'요청이 너무 큽니다.'},413);
  let body; try { body=JSON.parse(raw); } catch { return privateJson({error:'요청을 확인해주세요.'},400); }
  if(!body || !['get','create','shared','claim'].includes(body.action) || !['owner','worker'].includes(body.scope)) return privateJson({error:'요청을 확인해주세요.'},400);
  if(['shared','claim'].includes(body.action) && !/^[a-f0-9]{64}$/.test(body.token||'')) return privateJson({error:'초대 링크를 확인해주세요.'},400);
  const {data,error}=await auth.db.rpc('referral_action',{p_actor:auth.user.id,p_action:body.action,p_body:{scope:body.scope,token:body.token}});
  if(error) return privateJson({error:['PGRST202','42P01'].includes(error.code)?'초대·AI 보상 SQL 설정이 필요합니다.':['22023','42501'].includes(error.code)?error.message:'초대 처리에 실패했습니다. 다시 확인해주세요.'},['22023','42501'].includes(error.code)?400:503);
  return privateJson(data);
 } catch { return privateJson({error:'초대 정보를 불러오지 못했습니다.'},503); }
}
