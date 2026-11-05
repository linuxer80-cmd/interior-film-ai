import { AUDIO_BUCKET, validAudioPath } from './siteCallAudio.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve all company prefixes from the server inventory, including former
// companies. Never infer that an uploader owns a shared work photograph.
export async function deleteUserCallAudio(storage, userId, inventory, assertLease) {
  if (!uuid.test(userId || '')) throw new Error('Invalid user ID');
  if (typeof inventory !== 'function' || typeof assertLease !== 'function') {
    throw new Error('Verified audio inventory and lease required');
  }
  await assertLease();
  const paths = await inventory();
  if (!Array.isArray(paths) || paths.length > 10000 || new Set(paths).size !== paths.length ||
      paths.some(path => typeof path !== 'string' || !uuid.test(path.split('/')[0]) ||
        !validAudioPath(path, path.split('/')[0], userId))) {
    throw new Error('Unrecognized audio inventory requires review');
  }
  for (let offset = 0; offset < paths.length; offset += 100) {
    await assertLease();
    const { error } = await storage.from(AUDIO_BUCKET).remove(paths.slice(offset, offset + 100));
    if (error) throw error;
  }
  await assertLease();
  const remaining = await inventory();
  if (!Array.isArray(remaining) || remaining.length) throw new Error('Audio deletion could not be verified');
  return { deleted: paths.length, verified: true };
}
