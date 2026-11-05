export async function verifyAuthAccountDeleted(admin, userId) {
  const { data, error } = await admin.getUserById(userId);
  if (error?.code === 'user_not_found') return true;
  if (error) throw error;
  if (data?.user?.id === userId) return false;
  throw new Error('Unexpected auth verification response');
}

export async function deleteAuthAccount(admin, userId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '')) {
    throw new Error('Invalid deletion subject');
  }
  const { error } = await admin.deleteUser(userId, false);
  if (error && error.code !== 'user_not_found') throw error;
  if (!(await verifyAuthAccountDeleted(admin, userId))) {
    throw new Error('Auth account deletion not verified');
  }
}
