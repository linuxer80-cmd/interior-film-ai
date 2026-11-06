import { authenticateAdmin } from '../../../../lib/siteCallAuth';

export const runtime = 'nodejs';
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});

export async function GET(request) {
  try {
    const auth=await authenticateAdmin(request);
    if(!auth?.success) return json({error:auth?.error || '관리자 인증이 필요합니다.'},auth?.status || 401);
    const requested=request.headers.get('X-Assistant-Company');
    if(!requested || requested!==auth.companyId) return json({error:'선택한 업체를 확인해 주세요.'},403);
    const url=new URL(request.url);
    const view=url.searchParams.get('view');
    if(view && view!=='items') return json({error:'조회 방식을 확인해 주세요.'},400);
    const filter=view==='items' ? (url.searchParams.get('filter') || 'unpaid') : 'unpaid';
    const pageRaw=view==='items' ? (url.searchParams.get('page') || '0') : '0';
    const query=view==='items' ? (url.searchParams.get('q') || '').trim() : '';
    if(!['unpaid','settled','all'].includes(filter) || !/^(0|[1-9]\d{0,5})$/.test(pageRaw) || Number(pageRaw)>100000 || query.length>100)
      return json({error:'검색 조건을 확인해 주세요.'},400);
    const {data,error}=await auth.db.rpc('manage_site_settlement',{
      p_user:auth.userId,p_site:null,p_action:'completed_list',p_body:{filter,page:pageRaw,...(view==='items'?{q:query}:{})}
    });
    if(error) throw error;
    if(view==='items') {
      if(!Array.isArray(data?.items) || data.items.length>10 || !Number.isSafeInteger(data.count) || data.count<0 || data.items.length>data.count)
        throw new Error('invalid site list');
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const amount=value=>value===null || (typeof value==='number' && Number.isFinite(value));
      const items=data.items.map(item=>{
        if(!item || item.company_id!==auth.companyId || item.status!=='completed' || !uuid.test(item.id) || typeof item.confirmed!=='boolean' ||
           !['site_name','customer_name'].every(k=>item[k]==null || typeof item[k]==='string') ||
           !['contract_amount','paid','outstanding'].every(k=>Object.hasOwn(item,k) && amount(item[k])) ||
           (item.outstanding!==null && item.outstanding<0)) throw new Error('invalid site');
        return {id:item.id,site_name:item.site_name || '',customer_name:item.customer_name || '',confirmed:item.confirmed,
          contract_amount:item.contract_amount,paid:item.paid,outstanding:item.outstanding};
      });
      return json({companyId:auth.companyId,filter,page:Number(pageRaw),query,count:data.count,items});
    }
    const summary=data?.summary;
    if(!summary || typeof summary.outstanding!=='number' || !Number.isFinite(summary.outstanding) || summary.outstanding<0 ||
       !Number.isSafeInteger(summary.unconfirmed) || summary.unconfirmed<0) throw new Error('invalid summary');
    const unknown=await auth.db.from('site_receivable_balances').select('id',{count:'exact',head:true})
      .eq('company_id',auth.companyId).eq('status','completed').is('contract_amount',null);
    if(unknown.error || !Number.isSafeInteger(unknown.count) || unknown.count<0) throw new Error('invalid unknown count');
    return json({companyId:auth.companyId,outstanding:summary.outstanding,unconfirmed:summary.unconfirmed,unknownContract:unknown.count});
  } catch {
    return json({error:'완료 현장의 미수금을 확인하지 못했습니다.'},503);
  }
}
