import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { deleteUserAvatars } from '../lib/deletionAvatarStorage.mjs';
import { deleteAuthAccount } from '../lib/deletionAuthAccount.mjs';

const url = process.env.DELETION_TEST_SUPABASE_URL;
const key = process.env.DELETION_TEST_SERVICE_ROLE_KEY;
if (url !== 'https://vnpzrezwzkvwoqajbwvh.supabase.co' || !key) {
  throw new Error('Dedicated deletion-test project URL and server key required; no requests were sent');
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let userId;
try {
  const created = await db.auth.admin.createUser({
    email: `deletion-test-${randomUUID()}@example.invalid`,
    password: randomUUID() + randomUUID(), email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const path = `${userId}/${randomUUID()}.png`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
  const uploaded = await db.storage.from('labor-avatars').upload(path, png, { contentType: 'image/png', upsert: false });
  if (uploaded.error) throw uploaded.error;
  const before = await db.storage.from('labor-avatars').download(path);
  if (before.error || !before.data) throw new Error('Test object could not be read before deletion');
  const removed = await deleteUserAvatars(db.storage, userId);
  if (removed.deleted !== 1 || removed.verified !== true) throw new Error('Unexpected deletion result');
  await deleteAuthAccount(db.auth.admin, userId);
  userId = null;
  console.log('PASS: temporary avatar upload/read/delete/list verification and Auth deletion/read verification');
} finally {
  if (userId) {
    try {
      await deleteUserAvatars(db.storage, userId);
      await deleteAuthAccount(db.auth.admin, userId);
    } catch {
      // Only a synthetic ID is printed; never log secrets or raw API errors.
      console.error(`Temporary test cleanup needs attention: ${userId}`);
    }
  }
}
