import { pilotIdentity, pilotJson } from '../../../lib/materialPilotServer';

function noticeId(request) {
  const audience = new URL(request.url).searchParams.get('audience') || 'owner';
  if (!['owner', 'worker'].includes(audience)) throw Object.assign(Error('공지 대상을 확인해주세요.'), {status:400});
  return audience === 'owner' ? 1 : 2;
}
async function requireSuper(db, user) {
  const { data, error } = await db.from('super_admins').select('user_id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(Error('슈퍼관리자만 공지를 관리할 수 있습니다.'), { status: 403 });
}
function failure(error) {
  return pilotJson({ error: error.status ? error.message : '공지 설정을 확인해주세요. 공지사항 SQL 실행이 필요할 수 있습니다.' }, error.status || 503);
}
export async function GET(request) {
  try {
    const id = noticeId(request);
    const { db, user } = await pilotIdentity(request);
    const manage = new URL(request.url).searchParams.get('manage') === '1';
    if (manage) await requireSuper(db, user);
    let query = db.from('app_announcement').select('message,enabled,updated_at').eq('id', id);
    if (!manage) query = query.eq('enabled', true);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return pilotJson({ announcement: data });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return pilotJson({ error: '잘못된 요청입니다.' }, 403);
    const id = noticeId(request);
    const { db, user } = await pilotIdentity(request);
    await requireSuper(db, user);
    const raw = await request.text();
    if (raw.length > 10000) return pilotJson({ error: '공지는 500자 이내로 입력해주세요.' }, 400);
    let body;
    try { body = JSON.parse(raw); } catch { return pilotJson({ error: '입력 형식을 확인해주세요.' }, 400); }
    if (typeof body?.message !== 'string' || typeof body?.enabled !== 'boolean') return pilotJson({ error: '입력 형식을 확인해주세요.' }, 400);
    const message = body.message.replace(/\s+/g, ' ').trim();
    if (message.length > 500 || (body.enabled && !message)) return pilotJson({ error: '게시할 공지를 1~500자로 입력해주세요.' }, 400);
    const { error } = await db.from('app_announcement').upsert({ id, message, enabled: body.enabled, updated_at: new Date().toISOString(), updated_by: user.id });
    if (error) throw error;
    return pilotJson({ ok: true });
  } catch (error) { return failure(error); }
}
