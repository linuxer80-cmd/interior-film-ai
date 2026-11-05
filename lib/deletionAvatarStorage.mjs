// Delete only files under the verified user's avatar prefix. Shared work
// photos live in a different bucket and must not be removed here.
export async function deleteUserAvatars(storage, userId, assertLease = async () => {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '')) {
    throw new Error('Invalid user ID');
  }
  const bucket = storage.from('labor-avatars');
  const names = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    if (offset >= 10000) throw new Error('Avatar listing limit exceeded');
    await assertLease();
    const { data, error } = await bucket.list(userId, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Avatar listing failed');
    for (const item of data) {
      if (!item.id || !/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(item.name || '')) {
        throw new Error('Unrecognized avatar object requires review');
      }
      names.push(`${userId}/${item.name}`);
    }
    if (data.length < limit) break;
  }
  for (let i = 0; i < names.length; i += limit) {
    await assertLease();
    const { error } = await bucket.remove(names.slice(i, i + limit));
    if (error) throw error;
  }
  // A successful API response is not enough: confirm the prefix is empty.
  const { data, error } = await bucket.list(userId, { limit: 1, offset: 0 });
  if (error) throw error;
  if (!Array.isArray(data) || data.length) throw new Error('Avatar deletion could not be verified');
  return { deleted: names.length, verified: true };
}
