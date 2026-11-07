import { deleteUserTeamPhotos } from './teamChatPhoto.mjs';
import { assessDeletionRequest } from './accountDeletionPreflight.mjs';
import { deleteUserCallAudio } from './deletionAudioStorage.mjs';
import { deleteUserAvatars } from './deletionAvatarStorage.mjs';
import { deleteAuthAccount, verifyAuthAccountDeleted } from './deletionAuthAccount.mjs';
import { inspectDeletionReferences } from './deletionReferenceCheck.mjs';

// Server-only adapter. The verified cleanup implementation must be injected;
// there is intentionally no fallback that silently skips deletion steps.
export function createDeletionDatabaseAdapter(db, cleanup, { retryOnly = false } = {}) {
  const required = ['deletePrivateFiles','scrubPersonalData',
    'verifyBeforeAuthDeletion','verifyComplete'];
  for (const name of required) {
    if (typeof cleanup?.[name] !== 'function') throw new Error(`Missing deletion implementation: ${name}`);
  }
  let held = null;
  async function finish(id, lease, status) {
    const { data, error } = await db.rpc('finish_account_deletion_attempt', {
      p_request: id, p_lease: lease, p_status: status,
    });
    if (error) throw error;
    if (data !== true) throw new Error('Deletion lease expired or replaced');
    held = null;
  }
  async function assertLease(id, lease) {
    if (held?.id !== id || held.lease !== lease) throw new Error('Deletion lease mismatch');
    const { data, error } = await db.rpc('assert_account_deletion_lease', {
      p_request: id, p_lease: lease, p_subject: held.userId,
    });
    if (error) throw error;
    if (data !== true) throw new Error('Deletion execution lease is no longer valid');
    return true;
  }
  return {
    ...cleanup,
    assertExecutionLease: assertLease,
    async isAuthAlreadyDeleted(userId) {
      if (!held || held.userId !== userId) throw new Error('Deletion subject or lease mismatch');
      await assertLease(held.id, held.lease);
      return verifyAuthAccountDeleted(db.auth.admin, userId);
    },
    async verifyBeforeAuthDeletion(userId, plan) {
      if (!held || held.userId !== userId) throw new Error('Deletion subject or lease mismatch');
      if ((await inspectDeletionReferences(db, userId)).blocked) return false;
      const { data, error } = await db.rpc('verify_account_deletion_core', {
        p_request: held.id, p_lease: held.lease,
      });
      if (error) throw error;
      const checks = ['sessions_clear','refresh_tokens_clear','push_clear','labor_profile_clear',
        'labor_private_clear','directory_consent_clear','worker_private_clear','worker_details_clear'];
      if (!checks.every(key => data?.[key] === true)) return false;
      // Core checks do not cover all tables or Storage objects.
      return cleanup.verifyBeforeAuthDeletion(userId, plan);
    },
    async deleteAuthUser(userId) {
      if (!held || held.userId !== userId) throw new Error('Deletion subject or lease mismatch');
      await assertLease(held.id, held.lease);
      await deleteAuthAccount(db.auth.admin, userId);
    },
    async verifyComplete(userId, plan) {
      if (!(await verifyAuthAccountDeleted(db.auth.admin, userId))) return false;
      return cleanup.verifyComplete(userId, plan);
    },
    async complete(id, lease) {
      if (held?.id !== id || held.lease !== lease) throw new Error('Deletion lease mismatch');
      const { data, error } = await db.rpc('complete_account_deletion', {
        p_request: id, p_lease: lease,
      });
      if (error) throw error;
      if (data !== true) throw new Error('Deletion completion not confirmed');
      if (held?.id === id && held.lease === lease) held = null;
    },
    async claim(id) {
      const { data, error } = await db.rpc(retryOnly ? 'claim_account_deletion_retry' : 'claim_account_deletion_request', { p_request: id });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Invalid deletion claim');
      if (!data.length) return null;
      const row = data[0];
      row.user_id = row.user_id || row.subject_id;
      if (!row.user_id || !row.lease_token) throw new Error('Invalid deletion subject');
      held = { id, lease: row.lease_token, userId: row.user_id };
      // A processing status alone is not evidence of verified identity.
      return { userId: row.user_id, lease: row.lease_token, status: row.status,
        identityVerified: row.identity_verified === true, scope: row.scope };
    },
    async preflight(userId) {
      const result = await assessDeletionRequest(db, userId);
      return { complete: false, blockers: result.codes || [result.code] };
    },
    async blockAccess(userId, id, lease) {
      if (held?.id !== id || held.lease !== lease || held.userId !== userId) {
        throw new Error('Deletion subject or lease mismatch');
      }
      const { data, error } = await db.rpc('block_account_deletion_access', {
        p_request: id, p_lease: lease,
      });
      if (error) throw error;
      if (data !== true) throw new Error('Access blocking not confirmed');
      // Prevent a fresh login from recreating a session after revocation.
      // Shared Auth and sole-owner cases are rejected by the DB block RPC.
      const banned = await db.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
      if (banned.error) throw banned.error;
      if (banned.data?.user?.id !== userId ||
          !(Date.parse(banned.data.user.banned_until) > Date.now())) {
        throw new Error('Login blocking not confirmed');
      }
    },
    async removePushSubscriptions(userId) {
      const result = await db.from('push_subscriptions').delete().eq('user_id', userId);
      if (result.error) throw result.error;
      const check = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', userId);
      if (check.error) throw check.error;
      if (check.count !== 0) throw new Error('Push cleanup not verified');
    },
    async revokeSessions(userId) {
      if (!held || held.userId !== userId) throw new Error('Deletion subject or lease mismatch');
      const { data, error } = await db.rpc('revoke_account_deletion_sessions', {
        p_request: held.id, p_lease: held.lease,
      });
      if (error) throw error;
      if (data !== true) throw new Error('Session cleanup not confirmed');
    },
    async deletePrivateFiles(userId, plan) {
      if (!held || held.userId !== userId) throw new Error('Deletion subject or lease mismatch');
      // The full file cleanup remains mandatory: avatars are only one class
      // of private files, not proof that all personal media has been removed.
      const checkLease = () => assertLease(held.id, held.lease);
      await deleteUserAvatars(db.storage, userId, checkLease);
      await deleteUserCallAudio(db.storage, userId, async () => {
        const { data, error } = await db.rpc('inspect_account_deletion_audio', {
          p_request: held.id, p_lease: held.lease,
        });
        if (error) throw error;
        return data;
      }, checkLease);
      return cleanup.deletePrivateFiles(userId, plan);
    },
    async scrubPersonalData(userId, plan) {
      if (!held || held.userId !== userId) throw new Error('Deletion subject or lease mismatch');
      const calendar = await db.rpc('scrub_account_calendar_connection', {
        p_request: held.id, p_lease: held.lease,
      });
      if (calendar.error) throw calendar.error;
      if (calendar.data !== true) throw new Error('Calendar cleanup not confirmed');
      await deleteUserTeamPhotos(db,userId,()=>assertLease(held.id,held.lease));
      const teamChat = await db.rpc('scrub_account_team_chat', {
        p_request: held.id, p_lease: held.lease,
      });
      if (teamChat.error) throw teamChat.error;
      if (teamChat.data !== true) throw new Error('Team chat cleanup not confirmed');
      const documents = await db.rpc('scrub_account_document_actors', {
        p_request: held.id, p_lease: held.lease,
      });
      if (documents.error) throw documents.error;
      if (documents.data !== true) throw new Error('Document actor cleanup not confirmed');
      const materials = await db.rpc('scrub_account_material_actors', {
        p_request: held.id, p_lease: held.lease,
      });
      if (materials.error) throw materials.error;
      if (materials.data !== true) throw new Error('Material actor cleanup not confirmed');
      const orders = await db.rpc('scrub_account_order_actors', {
        p_request: held.id, p_lease: held.lease,
      });
      if (orders.error) throw orders.error;
      if (orders.data !== true) throw new Error('Order cleanup not confirmed');
      const notifications = await db.rpc('scrub_account_notifications', {
        p_request: held.id, p_lease: held.lease,
      });
      if (notifications.error) throw notifications.error;
      if (notifications.data !== true) throw new Error('Notification cleanup not confirmed');
      const badges = await db.rpc('scrub_account_badges', {
        p_request: held.id, p_lease: held.lease,
      });
      if (badges.error) throw badges.error;
      if (badges.data !== true) throw new Error('Badge cleanup not confirmed');
      const referrals = await db.rpc('scrub_account_referrals', {
        p_request: held.id, p_lease: held.lease,
      });
      if (referrals.error) throw referrals.error;
      if (referrals.data !== true) throw new Error('Referral cleanup not confirmed');
      const alimtalk = await db.rpc('scrub_account_alimtalk_actors', {
        p_request: held.id, p_lease: held.lease,
      });
      if (alimtalk.error) throw alimtalk.error;
      if (alimtalk.data !== true) throw new Error('Alimtalk cleanup not confirmed');
      const extraWork = await db.rpc('scrub_account_extra_work_actors', {
        p_request: held.id, p_lease: held.lease,
      });
      if (extraWork.error) throw extraWork.error;
      if (extraWork.data !== true) throw new Error('Extra work cleanup not confirmed');
      const reports = await db.rpc('scrub_account_report_actors', {
        p_request: held.id, p_lease: held.lease,
      });
      if (reports.error) throw reports.error;
      if (reports.data !== true) throw new Error('Report actor cleanup not confirmed');
      const payments = await db.rpc('scrub_account_payment_actors', {
        p_request: held.id, p_lease: held.lease,
      });
      if (payments.error) throw payments.error;
      if (payments.data !== true) throw new Error('Payment actor cleanup not confirmed');
      const invitations = await db.rpc('scrub_account_invitations', {
        p_request: held.id, p_lease: held.lease,
      });
      if (invitations.error) throw invitations.error;
      if (invitations.data !== true) throw new Error('Invitation cleanup not confirmed');
      const relationships = await db.rpc('scrub_account_relationships', {
        p_request: held.id, p_lease: held.lease,
      });
      if (relationships.error) throw relationships.error;
      if (relationships.data !== true) throw new Error('Relationship cleanup not confirmed');
      const { data, error } = await db.rpc('scrub_account_worker_details', {
        p_request: held.id, p_lease: held.lease,
      });
      if (error) throw error;
      if (!Number.isSafeInteger(data?.workers_scrubbed) || data.workers_scrubbed < 0) {
        throw new Error('Worker cleanup not confirmed');
      }
      // Worker details are only one part of the inventory. Do not silently
      // consider profile, chat, recruitment, and other personal data deleted.
      const attendance = await db.rpc('scrub_account_attendance', {
        p_request: held.id, p_lease: held.lease,
      });
      if (attendance.error) throw attendance.error;
      if (attendance.data !== true) throw new Error('Attendance cleanup not confirmed');
      const jobs = await db.rpc('scrub_account_jobs', {
        p_request: held.id, p_lease: held.lease,
      });
      if (jobs.error) throw jobs.error;
      if (jobs.data !== true) throw new Error('Job cleanup not confirmed');
      const recruitment = await db.rpc('scrub_account_recruitment', {
        p_request: held.id, p_lease: held.lease,
      });
      if (recruitment.error) throw recruitment.error;
      if (recruitment.data !== true) throw new Error('Recruitment cleanup not confirmed');
      const preferences = await db.rpc('scrub_account_preferences', {
        p_request: held.id, p_lease: held.lease,
      });
      if (preferences.error) throw preferences.error;
      if (preferences.data !== true) throw new Error('Preference cleanup not confirmed');
      const requests = await db.rpc('scrub_account_request_cache', {
        p_request: held.id, p_lease: held.lease,
      });
      if (requests.error) throw requests.error;
      if (requests.data !== true) throw new Error('Request cache cleanup not confirmed');
      await cleanup.scrubPersonalData(userId, plan);
      const detached = await db.rpc('detach_deleted_account_profile', {
        p_request: held.id, p_lease: held.lease,
      });
      if (detached.error) throw detached.error;
      if (detached.data !== true) throw new Error('Profile detachment not confirmed');
      return true;
    },
    review: (id, lease) => finish(id, lease, 'review_required'),
    fail: (id, lease) => finish(id, lease, 'failed'),
    async release(id, lease) {
      if (held?.id === id && held.lease === lease) {
        await finish(id, lease, 'failed');
      }
    },
  };
}
