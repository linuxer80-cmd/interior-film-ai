import { privateAuth, privateJson } from '../../../../lib/workerPrivate';
export const dynamic = 'force-dynamic';
export async function GET(request) {
 try {
  const auth = await privateAuth(request, false);
  if (auth.error) return privateJson({error:auth.error}, auth.status);
  const {db,user} = auth;
  const allowed = await db.from('super_admins').select('user_id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
  if (allowed.error) throw allowed.error;
  if (!allowed.data) return privateJson({error:'슈퍼관리자만 조회할 수 있습니다.'},403);
  const {data,error} = await db.rpc('landing_visitor_stats');
  if (error) throw error;
  return privateJson(data);
 } catch { return privateJson({error:'방문 통계를 불러오지 못했습니다. 다시 시도해주세요.'},503); }
}
