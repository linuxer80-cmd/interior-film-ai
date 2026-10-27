import {portalDb, resolvePortal} from '../../../../lib/customerPortal.mjs';
import {customerPhotoAccess, customerPhotoError, readCustomerPhotos, saveCustomerPhotos, listCustomerPhotos} from '../../../../lib/customerRequestPhotos.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'private, no-store', Vary: 'Authorization'}});
async function access(request) {
  const token = customerPhotoAccess(request), db = portalDb();
  const portal = await resolvePortal(token, db);
  if (!portal) throw customerPhotoError('고객 링크가 만료되었습니다. 업체에 새 링크를 요청해주세요.', 403);
  return {db, portal};
}
function failure(error) {
  if (!error.status) console.error('customer request photos', error.code || 'request_failed');
  return reply({error: error.status ? error.message : '사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'}, error.status || 503);
}
export async function GET(request) {
  try { const {db, portal} = await access(request); return reply(await listCustomerPhotos(db, portal)); }
  catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const {db, portal} = await access(request);
    const input = await readCustomerPhotos(request);
    return reply(await saveCustomerPhotos(db, portal, input));
  } catch (error) { return failure(error); }
}
