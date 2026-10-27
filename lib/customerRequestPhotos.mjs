import {createHash} from 'node:crypto';
import {normalizeChatPhoto} from './customerChatPhoto.mjs';

export const CUSTOMER_PHOTO_BODY_MAX = 3500000;
export const customerPhotoError = (message, status = 400) => Object.assign(Error(message), {status});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bucket = 'work-photos';

export function customerPhotoAccess(request) {
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin)
    throw customerPhotoError('고객페이지를 다시 열어주세요.', 403);
  return (request.headers.get('authorization') || '').replace(/^Bearer /, '');
}

export async function readCustomerPhotos(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.startsWith('multipart/form-data')) throw customerPhotoError('사진을 선택해주세요.');
  if (Number(request.headers.get('content-length')) > CUSTOMER_PHOTO_BODY_MAX)
    throw customerPhotoError('사진 용량이 너무 큽니다. 나누어 보내주세요.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw customerPhotoError('사진을 선택해주세요.');
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > CUSTOMER_PHOTO_BODY_MAX) { await reader.cancel(); throw customerPhotoError('사진 용량이 너무 큽니다. 나누어 보내주세요.', 413); }
    chunks.push(value);
  }
  let form;
  try { form = await new Response(Buffer.concat(chunks), {headers: {'Content-Type': type}}).formData(); }
  catch { throw customerPhotoError('사진을 다시 선택해주세요.'); }
  const id = form.get('requestId'), note = form.get('note') || '', files = form.getAll('photos');
  if (typeof id !== 'string' || !uuid.test(id)) throw customerPhotoError('전송 정보를 다시 확인해주세요.');
  if (typeof note !== 'string' || note.trim().length > 500) throw customerPhotoError('요청사항은 500자까지 입력해주세요.');
  if (!files.length || files.length > 10 || files.some(f => typeof f?.arrayBuffer !== 'function'))
    throw customerPhotoError('사진을 1~10장 선택해주세요.');
  return {id: id.toLowerCase(), note: note.trim(), files};
}

function rpcError(error) {
  if (error?.code === '42501') return customerPhotoError('상담 중인 고객 링크에서 이용해주세요.', 403);
  if (error?.code === '23505') return customerPhotoError('전송 내용이 달라졌습니다. 페이지를 다시 열어주세요.', 409);
  if (error?.code === 'P0001') return customerPhotoError('사진 전송이 많습니다. 잠시 후 다시 보내거나 업체에 문의해주세요.', 429);
  return customerPhotoError('사진 저장을 마치지 못했습니다. 다시 누르면 이어서 처리합니다.', 503);
}

export async function saveCustomerPhotos(db, portal, input, {normalize = normalizeChatPhoto} = {}) {
  if (portal.site.status !== 'consulting') throw customerPhotoError('상담 중인 현장에서 사진을 보낼 수 있습니다.', 403);
  const bytes = await Promise.all(input.files.map(f => f.arrayBuffer()));
  const fingerprint = hash(JSON.stringify({note: input.note, photos: bytes.map(b => hash(Buffer.from(b)))}));
  const reserved = await db.rpc('reserve_customer_photo_submission', {
    p_token: portal.token_id, p_id: input.id, p_fingerprint: fingerprint, p_note: input.note, p_count: input.files.length,
  });
  if (reserved.error) throw rpcError(reserved.error);
  if (reserved.data?.site_id !== portal.site_id || reserved.data?.company_id !== portal.company_id)
    throw customerPhotoError('현장 정보를 확인하지 못했습니다.', 403);
  if (reserved.data.status === 'completed') return {success: true, count: reserved.data.photo_count, duplicate: true};
  // Decode every image before uploading any. Sharp removes EXIF/GPS and rejects forged image types.
  const images = [];
  for (const file of input.files) images.push(await normalize(file));
  const rows = [];
  for (let i = 0; i < images.length; i++) {
    const path = `sites/${portal.company_id}/${portal.site_id}/request/customer-${input.id}-${i}.jpg`;
    const hex = hash(path).slice(0, 32);
    const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const uploaded = await db.storage.from(bucket).upload(path, images[i], {contentType: 'image/jpeg', upsert: false, cacheControl: '3600'});
    const code = String(uploaded.error?.statusCode || uploaded.error?.status || uploaded.error?.error || '');
    // Reservation fingerprints prevent different bytes from reusing this batch's paths.
    if (uploaded.error && !['409', 'Duplicate'].includes(code))
      throw customerPhotoError('사진 업로드가 중단되었습니다. 다시 누르면 이어서 보냅니다.', 503);
    rows.push({id, storage_path: path});
  }
  // Photos, the customer history, and ONE admin notification commit together.
  const saved = await db.rpc('complete_customer_photo_submission', {p_token: portal.token_id, p_id: input.id, p_fingerprint: fingerprint, p_photos: rows});
  if (saved.error) throw rpcError(saved.error);
  return {success: true, count: saved.data.photo_count, duplicate: saved.data.duplicate === true};
}

export async function listCustomerPhotos(db, portal) {
  const result = await db.from('customer_photo_submissions').select('id,note,photo_ids,completed_at')
    .eq('company_id', portal.company_id).eq('site_id', portal.site_id).eq('status', 'completed')
    .order('completed_at', {ascending: false}).limit(20);
  if (result.error) throw result.error;
  const batches = result.data || [];
  const ids = batches.flatMap(b => b.photo_ids);
  if (!ids.length) return {batches: []};
  const photos = await db.from('site_photos').select('id,storage_path').eq('company_id', portal.company_id)
    .eq('site_id', portal.site_id).eq('photo_type', 'request').in('id', ids);
  if (photos.error) throw photos.error;
  const byId = new Map(photos.data.map(p => [p.id, p]));
  const safeBatches = batches.map(b => ({id: b.id, note: b.note, createdAt: b.completed_at,
    photos: b.photo_ids.map(id => {
      const p = byId.get(id), prefix = `sites/${portal.company_id}/${portal.site_id}/request/customer-${b.id}-`;
      if (!p || !p.storage_path.startsWith(prefix) || !/^\d+\.jpg$/.test(p.storage_path.slice(prefix.length))) return null;
      return p;
    }).filter(Boolean),
  }));
  const paths = safeBatches.flatMap(b => b.photos.map(p => p.storage_path));
  const signed = paths.length ? await db.storage.from(bucket).createSignedUrls(paths, 600) : {data: []};
  const urls = new Map((signed.data || []).map(p => [p.path, p.signedUrl]));
  return {batches: safeBatches.map(b => ({...b, photos: b.photos.map(p => ({id: p.id, url: urls.get(p.storage_path) || null}))}))};
}
