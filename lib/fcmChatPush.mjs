import { createSign } from 'node:crypto';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const base64url = value => Buffer.from(value).toString('base64url');
const tokenUrl = 'https://oauth2.googleapis.com/token';
const scope = 'https://www.googleapis.com/auth/firebase.messaging';

/** Construct a payload from server-authorized metadata and optional bounded preview. */
export function chatPushPayload({ token, recipientId, companyId, kind, targetId, date, messageId, title, body }) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /\s/.test(token) ||
      ![recipientId, companyId, targetId, messageId].every(uuid) ||
      !['customer', 'team'].includes(kind) ||
      (kind === 'team' && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)))) {
    throw new Error('Invalid chat push metadata');
  }
  return { message: {
    token,
    data: { kind, recipient_id: recipientId, company_id: companyId, target_id: targetId,
      message_id: messageId, ...(typeof title==='string' && title.trim() ? {title:title.slice(0,120)} : {}), ...(typeof body==='string' ? {body:body.slice(0,300)} : {}), ...(kind === 'team' ? { date } : {}) },
    android: { priority: 'high', ttl: '3600s', restricted_package_name: 'kr.fieldassistant.prototype.stable' },
  } };
}

/** General notices include only the display text already used for browser push. */
export function noticePushPayload({ token, recipientId, noticeId, title, body, ttlSeconds=3600, siteTarget=null }) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /\s/.test(token) ||
      ![recipientId, noticeId].every(uuid) || typeof title !== 'string' || !title.trim() || title.length > 120 ||
      typeof body !== 'string' || body.length > 500 || ![0,3600].includes(ttlSeconds)) throw new Error('Invalid notice metadata');
  if(siteTarget!==null && (!siteTarget || !uuid(siteTarget.companyId) || !uuid(siteTarget.siteId)))
    throw new Error('Invalid notice site target');
  return {message:{token,data:{kind:'notice',recipient_id:recipientId,notice_id:noticeId,title,body,
    ...(siteTarget ? {company_id:siteTarget.companyId,site_id:siteTarget.siteId,...(['report','request_photos'].includes(siteTarget.action)?{site_action:siteTarget.action}:{})} : {})},
    android:{priority:'high',ttl:`${ttlSeconds}s`,restricted_package_name:'kr.fieldassistant.prototype.stable'}}};
}

/** Server-only sender. No service account keys or registration tokens are logged. */
export function createFcmSender({ projectId, clientEmail, privateKey, fetchImpl = fetch, now = () => Date.now() }) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId || '') ||
      typeof clientEmail !== 'string' || !clientEmail.endsWith('.gserviceaccount.com') ||
      typeof privateKey !== 'string' || !privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Firebase server credentials are not configured');
  }
  let cachedToken = null;
  let tokenExpires = 0;
  let pendingToken = null;

  async function accessToken() {
    const seconds = Math.floor(now() / 1000);
    if (cachedToken && seconds < tokenExpires - 60) return cachedToken;
    if (pendingToken) return pendingToken;
    pendingToken = (async () => {
      const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const claims = base64url(JSON.stringify({ iss: clientEmail, scope, aud: tokenUrl, iat: seconds, exp: seconds + 3600 }));
      const input = `${header}.${claims}`;
      const signer = createSign('RSA-SHA256'); signer.update(input); signer.end();
      const assertion = `${input}.${signer.sign(privateKey).toString('base64url')}`;
      const response = await fetchImpl(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Firebase authorization failed');
      const body = await response.json();
      if (typeof body.access_token !== 'string' || !Number.isFinite(body.expires_in) || body.expires_in <= 60)
        throw new Error('Invalid Firebase authorization response');
      cachedToken = body.access_token; tokenExpires = seconds + Math.min(body.expires_in, 3600);
      return cachedToken;
    })();
    try { return await pendingToken; } finally { pendingToken = null; }
  }

  return async metadata => {
    const payload = metadata.kind === 'notice' ? noticePushPayload(metadata) : chatPushPayload(metadata);
    const bearer = await accessToken();
    const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return { state: 'accepted' };
    // Only a confirmed UNREGISTERED response is safe to use for token cleanup.
    const body = await response.json().catch(() => ({}));
    const unregistered = response.status === 404 && Array.isArray(body?.error?.details) &&
      body.error.details.some(detail => detail?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError' && detail.errorCode === 'UNREGISTERED');
    return { state: unregistered ? 'unregistered' : 'failed', status: response.status };
  };
}
