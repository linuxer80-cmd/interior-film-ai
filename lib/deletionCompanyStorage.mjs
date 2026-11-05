const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_ROOTS = new Set(['sites', 'history', 'hierarchy', 'door-test', 'estimate-usage', 'extra-work']);

// Only a server-generated inventory is accepted. Uploader identity does not
// establish company ownership; shared samples and personal avatars are excluded.
export function validateCompanyFileInventory(companyId, manifest) {
  if (!UUID.test(companyId || '') || manifest?.companyId !== companyId ||
      !Array.isArray(manifest.files) || manifest.files.length > 100000 ||
      !Array.isArray(manifest.chatThreadIds) || manifest.chatThreadIds.some(id => !UUID.test(id))) {
    throw new Error('Invalid company file inventory');
  }
  const threads = new Set(manifest.chatThreadIds), seen = new Set();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || typeof file.bucket !== 'string') throw new Error('Invalid company file');
    const parts = file.path.split('/');
    if (parts.some(p => !p || p === '.' || p === '..') || /[\\%\x00-\x1f]/.test(file.path)) throw new Error('Unsafe company file path');
    const owned = (file.bucket === 'work-photos' && PHOTO_ROOTS.has(parts[0]) && parts[1] === companyId && parts.length >= 3) ||
      (['company-showcase', 'site-call-audio-private'].includes(file.bucket) && parts[0] === companyId && parts.length >= 2) ||
      (file.bucket === 'customer-chat' && threads.has(parts[0]) && parts.length === 2);
    const key = `${file.bucket}\0${file.path}`;
    if (!owned || seen.has(key)) throw new Error('Unrecognized or duplicate company file');
    seen.add(key);
  }
  return manifest.files;
}

// freeze/assertFrozen must be backed by durable server-side company write guards.
// This helper never enables deletion or claims the company's DB rows are gone.
export async function deleteCompanyFiles({ storage, companyId, inventory, assertFrozen, assertLease, detachSharedReferences, verifySharedReferences }) {
  if (![inventory, assertFrozen, assertLease].every(fn => typeof fn === 'function')) throw new Error('Company deletion guards required');
  const guard = async () => {
    if (await assertLease() !== true || await assertFrozen(companyId) !== true) throw new Error('Company deletion guard failed');
  };
  await guard();
  const manifest = await inventory(companyId);
  const files = validateCompanyFileInventory(companyId, manifest);
  if (manifest.complete !== true) throw new Error('Company file inventory incomplete');
  const shared = manifest.sharedFiles ?? [];
  validateCompanyFileInventory(companyId, { ...manifest, files: shared });
  const fileKeys = new Set(files.map(f => `${f.bucket}\0${f.path}`));
  if (shared.some(f => !fileKeys.has(`${f.bucket}\0${f.path}`))) throw new Error('Shared file outside deletion inventory');
  if (shared.length && (manifest.sharedFilePolicy !== 'delete_original_and_references' ||
      typeof detachSharedReferences !== 'function' || typeof verifySharedReferences !== 'function')) {
    throw new Error('Shared photo reference cleanup required');
  }
  const verifyReferences = async () => {
    if (shared.length && await verifySharedReferences(companyId, shared) !== true) throw new Error('Shared photo references remain');
  };
  if (shared.length) {
    await guard();
    if (await detachSharedReferences(companyId, shared) !== true) throw new Error('Shared photo cleanup not confirmed');
    await verifyReferences();
  }
  const groups = new Map();
  for (const file of files) {
    if (!groups.has(file.bucket)) groups.set(file.bucket, []);
    groups.get(file.bucket).push(file.path);
  }
  for (const [bucket, paths] of groups) {
    for (let i = 0; i < paths.length; i += 100) {
      await guard();
      await verifyReferences();
      const result = await storage.from(bucket).remove(paths.slice(i, i + 100));
      if (!result || result.error) throw new Error('Company file deletion failed');
    }
  }
  await guard();
  await verifyReferences();
  const remaining = await inventory(companyId);
  if (validateCompanyFileInventory(companyId, remaining).length || remaining.complete !== true || (remaining.sharedFiles && (!Array.isArray(remaining.sharedFiles) || remaining.sharedFiles.length))) throw new Error('Company file deletion not verified');
  return { deleted: files.length, verified: true };
}
