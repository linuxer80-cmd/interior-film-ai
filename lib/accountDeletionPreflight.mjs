// Read-only assessment. Never treat the absence of a profile as proof that
// the account has no data: workers can use the app without an owner profile.
import { assessCompanyDeletionFiles } from './accountDeletionCompanyAssessment.mjs';
import { inspectDeletionReferences } from './deletionReferenceCheck.mjs';
export async function assessDeletionRequest(db, userId) {
  const shared = await db.rpc('account_deletion_shared_auth_check', { p_user: userId });
  if (shared.error || typeof shared.data !== 'boolean') {
    throw new Error('Shared authentication check unavailable');
  }
  const codes = [];
  if (shared.data) codes.push('shared_account_review_required');
  const profile = await db.from('profiles').select('role,company_id').eq('id', userId).maybeSingle();
  if (profile.error) throw profile.error;
  if (profile.data?.role === 'owner' && profile.data.company_id) {
    const owners = await db.from('profiles').select('id', { count: 'exact', head: true })
      .eq('company_id', profile.data.company_id).eq('role', 'owner').eq('is_active', true).neq('id', userId);
    if (owners.error) throw owners.error;
    if (!Number.isSafeInteger(owners.count) || owners.count < 0) throw new Error('Owner count unavailable');
    if (owners.count === 0) codes.push('company_deletion_required');
  }
  const orders = await db.rpc('assess_account_deletion_orders', { p_user: userId });
  const orderChecks = ['dealer_transfer_required', 'open_orders',
    'delivery_review_required', 'saved_addresses_review_required'];
  if (orders.error || !orderChecks.every(key => typeof orders.data?.[key] === 'boolean')) {
    throw new Error('Order deletion assessment unavailable');
  }
  if (orders.data.dealer_transfer_required) codes.push('dealer_transfer_required');
  if (orders.data.open_orders) codes.push('open_orders_review_required');
  if (orders.data.delivery_review_required || orders.data.saved_addresses_review_required) {
    codes.push('delivery_privacy_review_required');
  }
  if (codes.includes('company_deletion_required')) {
    try {
      const company = await assessCompanyDeletionFiles(db, userId);
      codes.push(...company.codes);
    } catch {
      // A diagnostic outage must not hide other confirmed blocking reasons.
      codes.push('company_scope_unavailable');
    }
  }
  // The complete table/file inventory and shared Auth check must be supplied
  // by the DB deletion adapter before any account can execute automatically.
  const inventory = await inspectDeletionReferences(db, userId);
  if (inventory.blocked) codes.push('linked_records_review_required');
  if (!codes.length) codes.push('data_scope_review_required');
  return { code: codes[0], codes, executable: false };
}
