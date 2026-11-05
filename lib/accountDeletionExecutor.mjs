// The adapter must use server credentials and durable database state. Never
// expose this executor directly to an unauthenticated request or client input.
export async function executeAccountDeletion(adapter, requestId) {
  if (typeof requestId !== 'string' || !requestId.trim()) throw new Error('Request ID required');
  // claim() must atomically acquire an exclusive, expiring execution lease.
  const job = await adapter.claim(requestId);
  if (!job) return { status: 'busy' };
  // A malformed claim cannot authorize a write, including failure/release writes.
  // Leave recovery of an invalid durable claim to the lease recovery workflow.
  if (typeof job !== 'object' || Array.isArray(job) ||
      typeof job.userId !== 'string' || !job.userId.trim() ||
      typeof job.lease !== 'string' || !job.lease.trim() ||
      !['processing', 'failed', 'completed'].includes(job.status)) {
    throw new Error('Invalid deletion execution claim');
  }
  const { userId, lease } = job;
  let originalError;
  try {
    if (job.status === 'completed') return { status: 'completed' };
    if (job.identityVerified !== true || job.scope !== 'personal_account') {
      throw new Error('Verified personal account deletion required');
    }
    let plan = await adapter.preflight(userId);
    if (plan?.complete !== true || plan?.sharedAuth === true ||
        (plan?.soleOwner === true && typeof adapter.deleteCompany !== 'function') || !Array.isArray(plan?.blockers) || plan.blockers.length) {
      await adapter.review(requestId, lease);
      return { status: 'review_required' };
    }
    // These operations must be idempotent: retries repeat every step and
    // independently verify the final state, including partial file failures.
    const checkLease = async () => {
      if (typeof adapter.assertExecutionLease !== 'function' ||
          await adapter.assertExecutionLease(requestId, lease) !== true) {
        throw new Error('Deletion execution lease not confirmed');
      }
    };
    // Auth may have been removed just before a completion-write outage. Never
    // try to ban a missing login or recreate it. Verify every remaining record
    // and file before writing the durable receipt; absence of Auth alone is not
    // evidence of successful cleanup.
    if (typeof adapter.isAuthAlreadyDeleted === 'function') {
      await checkLease();
      const absent = await adapter.isAuthAlreadyDeleted(userId);
      if (typeof absent !== 'boolean') throw new Error('Auth deletion state not confirmed');
      if (absent) {
        if (plan.soleOwner === true) throw new Error('Company cleanup incomplete after Auth deletion');
        await checkLease();
        if (await adapter.verifyBeforeAuthDeletion(userId, plan) !== true) throw new Error('Personal data cleanup not verified');
        await checkLease();
        if (await adapter.verifyComplete(userId, plan) !== true) throw new Error('Deletion completion not verified');
        await checkLease();
        await adapter.complete(requestId, lease);
        return { status: 'completed' };
      }
    }
    if (plan.soleOwner === true) {
      await checkLease();
      if (await adapter.deleteCompany(userId, plan, requestId, lease) !== true) {
        throw new Error('Company deletion not confirmed');
      }
      await checkLease();
      // Re-evaluate after company finalization. Never reuse the pre-delete plan
      // to authorize personal/Auth deletion or recursively delete another company.
      plan = await adapter.preflight(userId);
      if (plan?.complete !== true || plan?.sharedAuth === true || plan?.soleOwner === true ||
          !Array.isArray(plan?.blockers) || plan.blockers.length) {
        throw new Error('Post-company deletion scope not confirmed');
      }
    }
    await checkLease();
    await adapter.blockAccess(userId, requestId, lease);
    await checkLease();
    await adapter.revokeSessions(userId);
    await checkLease();
    await adapter.removePushSubscriptions(userId);
    await checkLease();
    await adapter.deletePrivateFiles(userId, plan);
    await checkLease();
    await adapter.scrubPersonalData(userId, plan);
    await checkLease();
    const beforeAuth = await adapter.verifyBeforeAuthDeletion(userId, plan);
    if (beforeAuth !== true) throw new Error('Personal data cleanup not verified');
    await checkLease();
    await adapter.deleteAuthUser(userId);
    await checkLease();
    if (await adapter.verifyComplete(userId, plan) !== true) {
      throw new Error('Deletion completion not verified');
    }
    await checkLease();
    await adapter.complete(requestId, lease);
    return { status: 'completed' };
  } catch (error) {
    // Keep the block in place during retry. Do not persist exception strings,
    // which can include file paths, credentials, or personal information.
    originalError = error;
    try { await adapter.fail(requestId, lease, 'deletion_incomplete'); } catch { /* preserve the processing error */ }
    throw error;
  } finally {
    try { await adapter.release(requestId, lease); } catch (releaseError) {
      if (!originalError) throw releaseError;
    }
  }
}
