// Auth deletion is already confirmed by the server. This is best-effort local
// cleanup only; never erase a different account or revoke other browser sessions.
export async function clearDeletedAccountSession(client, subjectId) {
  if (typeof subjectId !== 'string' || !subjectId) return false;
  try {
    const current = await client.auth.getSession();
    if (current.error || current.data?.session?.user?.id !== subjectId) return false;
    const result = await client.auth.signOut({ scope: 'local' });
    return !result?.error;
  } catch {
    return false;
  }
}
