import { createHmac, timingSafeEqual } from 'node:crypto';
export const BOOTPAY_MESSAGE_URL = 'https://message.bootapi.com';
export const EVENT_KEYS = {
  site_assignment: 'ASSIGNMENT', site_worker_assigned: 'ASSIGNMENT',
  site_schedule_changed: 'SCHEDULE', site_change: 'SCHEDULE',
  site_cancelled: 'CANCEL', site_d1_reminder: 'REMINDER', site_today_reminder: 'REMINDER',
};
export function configuration(env = process.env) {
  return {
    ready: env.BOOTPAY_ALIMTALK_ENABLED === 'true' && Boolean(env.BOOTPAY_COMMERCE_CLIENT_KEY && env.BOOTPAY_COMMERCE_SECRET_KEY && env.BOOTPAY_ALIMTALK_WEBHOOK_SECRET && env.BOOTPAY_ALIMTALK_SENDER_KEY),
    templates: Object.fromEntries(['ASSIGNMENT','SCHEDULE','CANCEL','REMINDER','TEST'].map(k => [k, Boolean(env[`BOOTPAY_ALIMTALK_TEMPLATE_${k}`])])),
  };
}
export function normalizePhone(value) {
  let n = String(value || '').replace(/[^0-9]/g, '');
  if(n.startsWith('82')) n = '0' + n.slice(2);
  return /^01[016789]\d{7,8}$/.test(n) ? n : '';
}
export function verifyWebhook(raw, headers, secret, now = Date.now()) {
  const timestamp = headers.get('x-bootpay-timestamp') || '';
  const signature = headers.get('x-bootpay-signature') || '';
  if(!secret || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  return timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), Buffer.from(expected, 'hex'));
}
export async function bootpayRequest(path, body, { env = process.env, fetchImpl = fetch } = {}) {
  const auth = Buffer.from(`${env.BOOTPAY_COMMERCE_CLIENT_KEY}:${env.BOOTPAY_COMMERCE_SECRET_KEY}`).toString('base64');
  const response = await fetchImpl(`${BOOTPAY_MESSAGE_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok || raw?.error_code) {
    const error = new Error('부트페이 요청을 처리하지 못했습니다.');
    error.providerCode = String(raw?.error_code || response.status).slice(0,80);
    // Network errors/5xx/408/429 are uncertain: never refund or resend automatically.
    error.rejected = response.status >= 400 && response.status < 500 && ![408,429].includes(response.status);
    throw error;
  }
  const data = raw?.data || raw;
  if(!data || !data.receipt_id || !['requested','success','failed','canceled'].includes(data.status)) throw new Error('부트페이 응답 확인이 필요합니다.');
  return data;
}
