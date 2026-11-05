import { authenticateAdmin } from '../../../../lib/siteCallAuth';
import { siteBasicPatch } from '../../../../lib/siteBasicPatch.mjs';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = new Set(['consulting', 'scheduled', 'in_progress', 'completed', 'cancelled']);
const allowed = new Set(['customer_name', 'customer_phone', 'site_name', 'address', 'address_detail', 'work_description', 'memo']);
const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control':'private, no-store', Vary:'Authorization'}});

export async function POST(request) {
  try {
    const auth = await authenticateAdmin(request);
    if (!auth?.success) return json({error:auth?.error || '관리자 인증이 필요합니다.'}, auth?.status || 401);
    let body;
    try { body = await request.json(); } catch { return json({error:'입력 내용을 확인해 주세요.'},400); }
    if (!uuid.test(body?.siteId || '') || !statuses.has(body?.expectedStatus) ||
        !Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt') ||
        !(body.expectedUpdatedAt === null || (typeof body.expectedUpdatedAt === 'string' && body.expectedUpdatedAt.length <= 64 && Number.isFinite(Date.parse(body.expectedUpdatedAt)))) ||
        !body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields) ||
        Object.keys(body.fields).length === 0 || Object.keys(body.fields).some(key => !allowed.has(key)))
      return json({error:'현장과 변경 내용을 확인해 주세요.'},400);
    let fields;
    try { fields = siteBasicPatch(body.fields); } catch (error) { return json({error:error.message},400); }
    let update = auth.db.from('sites').update({...fields, updated_at:new Date().toISOString()})
      .eq('company_id',auth.companyId).eq('id',body.siteId).eq('status',body.expectedStatus);
    update = body.expectedUpdatedAt === null ? update.is('updated_at',null) : update.eq('updated_at',body.expectedUpdatedAt);
    const {data,error} = await update.select('id,company_id,status,updated_at').maybeSingle();
    if (error) throw error;
    if (!data) return json({error:'현장 정보가 바뀌었거나 접근할 수 없습니다. 다시 확인해 주세요.'},409);
    return json({success:true,site:data});
  } catch (error) {
    console.error('conditional site update',error?.code || 'failed');
    return json({error:'현장 정보를 저장하지 못했습니다. 다시 확인해 주세요.'},500);
  }
}
