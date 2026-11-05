import { authenticateAdmin } from '../../../../lib/siteCallAuth';

export const runtime = 'nodejs';
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});

export async function GET(request) {
  try {
    const auth=await authenticateAdmin(request);
    if(!auth?.success) return json({error:auth?.error || '관리자 인증이 필요합니다.'},auth?.status || 401);
    const requested=request.headers.get('X-Assistant-Company');
    if(!requested || requested!==auth.companyId) return json({error:'선택한 업체를 확인해 주세요.'},403);
    const {data,error}=await auth.db.rpc('manage_site_settlement',{
      p_user:auth.userId,p_site:null,p_action:'completed_list',p_body:{filter:'unpaid',page:'0'}
    });
    if(error) throw error;
    const summary=data?.summary;
    if(!summary || typeof summary.outstanding!=='number' || !Number.isFinite(summary.outstanding) || summary.outstanding<0 ||
       !Number.isSafeInteger(summary.unconfirmed) || summary.unconfirmed<0) throw new Error('invalid summary');
    return json({companyId:auth.companyId,outstanding:summary.outstanding,unconfirmed:summary.unconfirmed});
  } catch {
    return json({error:'완료 현장의 미수금을 확인하지 못했습니다.'},503);
  }
}
