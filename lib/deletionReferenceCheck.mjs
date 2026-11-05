export async function inspectDeletionReferences(db, userId) {
  const { data, error } = await db.rpc('inspect_account_deletion_references', { p_user: userId });
  if (error) throw error;
  if (!Array.isArray(data) || data.some(row => !row ||
      typeof row.schema !== 'string' || typeof row.table !== 'string' ||
      typeof row.column !== 'string' || !Number.isSafeInteger(row.rows) || row.rows <= 0 ||
      !['a','r','c','n','d','unlinked'].includes(row.delete_action))) {
    throw new Error('Invalid deletion reference inventory');
  }
  return { references: data, blocked: data.some(row => ['a','r','unlinked'].includes(row.delete_action)) };
}
