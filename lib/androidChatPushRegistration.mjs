const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function validatePushRegistration(body, remove = false) {
  if (!body || !uuid(body.deviceId)) throw Object.assign(Error('기기 정보를 확인해주세요.'), { status: 400 });
  if (!remove && (typeof body.token !== 'string' || body.token.length < 20 || body.token.length > 4096 || /\s/.test(body.token)))
    throw Object.assign(Error('알림 등록 정보를 확인해주세요.'), { status: 400 });
  if (!remove && ['chatReady','generalReady'].some(key => key in body && typeof body[key] !== 'boolean'))
    throw Object.assign(Error('알림 설정을 확인해주세요.'), { status: 400 });
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
  const record = { device_id: deviceId, user_id: userId, token, updated_at: new Date().toISOString() };
  let result = await db.from('android_chat_push_tokens').upsert({ ...record,
    native_chat_ready: body.chatReady === true, native_general_ready: body.generalReady === true }, { onConflict: 'device_id' });
  // During staged rollout the database may not yet have the capability columns.
  if (['42703', 'PGRST204'].includes(result.error?.code))
    result = await db.from('android_chat_push_tokens').upsert(record, { onConflict: 'device_id' });
  if (result.error) throw result.error;
}
