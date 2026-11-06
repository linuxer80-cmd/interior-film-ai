const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function validatePushRegistration(body, remove = false) {
  if (!body || !uuid(body.deviceId)) throw Object.assign(Error('기기 정보를 확인해주세요.'), { status: 400 });
  if (!remove && (typeof body.token !== 'string' || body.token.length < 20 || body.token.length > 4096 || /\s/.test(body.token)))
    throw Object.assign(Error('알림 등록 정보를 확인해주세요.'), { status: 400 });
  return { deviceId: body.deviceId, ...(remove ? {} : { token: body.token }) };
}

export async function updatePushRegistration(db, userId, body, remove = false) {
  const { deviceId, token } = validatePushRegistration(body, remove);
  if (remove) {
    // A delayed logout must never remove another user's later registration.
    const result = await db.from('android_chat_push_tokens').delete().eq('device_id', deviceId).eq('user_id', userId);
    if (result.error) throw result.error;
    return;
  }
  const blocked = await db.from('account_deletion_blocks').select('user_id').eq('user_id', userId).maybeSingle();
  if (blocked.error) throw blocked.error;
  if (blocked.data) throw Object.assign(Error('사용할 수 없는 계정입니다.'), { status: 403 });
  const result = await db.from('android_chat_push_tokens').upsert({ device_id: deviceId, user_id: userId, token,
    updated_at: new Date().toISOString() }, { onConflict: 'device_id' });
  if (result.error) throw result.error;
}
