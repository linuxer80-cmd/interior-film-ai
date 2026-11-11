import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { chatPushPayload, noticePushPayload, createFcmSender } from '../lib/fcmChatPush.mjs';

const meta = { token: 'registration-token-for-test', recipientId: '11111111-1111-1111-1111-111111111111',
  companyId: '22222222-2222-2222-2222-222222222222', targetId: '33333333-3333-3333-3333-333333333333',
  messageId: '44444444-4444-4444-4444-444444444444', kind: 'team', date: '2026-11-06' };

test('chat payload bounds authorized preview and rejects invalid routing', () => {
  const payload = chatPushPayload({ ...meta, body: 'private message', title: 'private name' });
  assert.equal(payload.message.android.restricted_package_name, 'kr.fieldassistant.prototype.stable');
  assert.equal(payload.message.data.body,'private message');
  assert.equal(chatPushPayload({...meta,body:'x'.repeat(900),title:'y'.repeat(200)}).message.data.body.length,300);
  assert.equal(chatPushPayload(meta).message.data.body,undefined);
  assert.throws(() => chatPushPayload({ ...meta, targetId: 'not-a-uuid' }));
  assert.throws(() => chatPushPayload({ ...meta, date: 'invalid' }));
});

test('server authenticates FCM, signs JWT, reuses access token and distinguishes expired registrations', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const calls = [];
  const fakeFetch = async (url, request) => {
    calls.push({ url, request });
    if (url.includes('oauth2.googleapis.com')) {
      const jwt = request.body.get('assertion');
      const [header, claims, sig] = jwt.split('.');
      const verifier = createVerify('RSA-SHA256'); verifier.update(`${header}.${claims}`); verifier.end();
      assert.equal(verifier.verify(publicKey, Buffer.from(sig, 'base64url')), true);
      assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).scope, 'https://www.googleapis.com/auth/firebase.messaging');
      return { ok: true, json: async () => ({ access_token: 'test-access', expires_in: 3600 }) };
    }
    assert.equal(request.headers.Authorization, 'Bearer test-access');
    return calls.length === 2 ? { ok: true } : { ok: false, status: 404, json: async () => ({ error: { details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } }) };
  };
  const send = createFcmSender({ projectId: 'field-ai-assistant', clientEmail: 'test@project.iam.gserviceaccount.com', privateKey, fetchImpl: fakeFetch, now: () => 1800000000000 });
  assert.deepEqual(await send(meta), { state: 'accepted' });
  assert.deepEqual(await send(meta), { state: 'unregistered', status: 404 });
  assert.equal(calls.length, 3);
});

test('general notice payload limits fields and is targeted to the Android package',()=>{
 const p=noticePushPayload({...meta,noticeId:meta.messageId,title:'일정',body:'내일 현장을 확인하세요'});
 assert.equal(p.message.data.kind,'notice');assert.equal(p.message.data.recipient_id,meta.recipientId);
 assert.equal(p.message.android.restricted_package_name,'kr.fieldassistant.prototype.stable');
 assert.equal(noticePushPayload({...meta,noticeId:meta.messageId,title:'일정',body:'알림',ttlSeconds:0}).message.android.ttl,'0s');
 assert.throws(()=>noticePushPayload({...meta,noticeId:meta.messageId,title:'일정',body:'알림',ttlSeconds:999}));
 assert.throws(()=>noticePushPayload({...meta,noticeId:'bad',title:'일정',body:'text'}));
 assert.throws(()=>noticePushPayload({...meta,noticeId:meta.messageId,title:'a'.repeat(121),body:'text'}));
});

test('general site notifications carry only validated opaque routing identifiers',()=>{
 const data={...meta,noticeId:meta.messageId,title:'시공 일정',body:'현장을 확인해 주세요',siteTarget:{companyId:meta.companyId,siteId:meta.targetId}};
 const payload=noticePushPayload(data).message.data;
 assert.equal(payload.company_id,meta.companyId);assert.equal(payload.site_id,meta.targetId);
 assert.equal('url' in payload,false);
 assert.equal(noticePushPayload({...data,siteTarget:{...data.siteTarget,action:'request_photos'}}).message.data.site_action,'request_photos');
 assert.equal(noticePushPayload({...data,siteTarget:{...data.siteTarget,action:'delete'}}).message.data.site_action,undefined);
 assert.throws(()=>noticePushPayload({...data,siteTarget:{companyId:'invalid',siteId:meta.targetId}}));
 assert.throws(()=>noticePushPayload({...data,siteTarget:{companyId:meta.companyId}}));
});
