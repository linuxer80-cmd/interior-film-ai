import { privateAuth, privateJson } from '../../../../lib/workerPrivate';
import { updatePushRegistration } from '../../../../lib/androidChatPushRegistration.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function change(request, remove) {
  try {
    const auth = await privateAuth(request, false);
    if (auth.error) return privateJson({ error: auth.error }, auth.status);
    const reader = request.body?.getReader();
    if (!reader) return privateJson({ error: '기기 정보를 확인해주세요.' }, 400);
    let total = 0; const parts = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 5000) { await reader.cancel(); return privateJson({ error: '기기 정보를 확인해주세요.' }, 400); }
      parts.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); }
    catch { return privateJson({ error: '기기 정보를 확인해주세요.' }, 400); }
    await updatePushRegistration(auth.db, auth.user.id, body, remove);
    return privateJson({ ok: true });
  } catch (error) {
    return privateJson({ error: error.status ? error.message : '알림 설정을 확인하지 못했습니다.' }, error.status || 503);
  }
}
export async function POST(request) { return change(request, false); }
export async function DELETE(request) { return change(request, true); }
