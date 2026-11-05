// Read-only, display-only diagnostics. Never promotes a deletion to executable.
// Resolve the request by authenticated subject; do not accept a client request ID.
export async function assessCompanyDeletionFiles(db, userId) {
  const request = await db.from('account_deletion_requests')
    .select('id,company_deletion_id').eq('user_id', userId).maybeSingle();
  if (request.error) throw request.error;
  if (!request.data?.id || !request.data.company_deletion_id) {
    return {codes: ['company_scope_unavailable']};
  }
  const result = await db.rpc('inspect_company_deletion_files', {p_request: request.data.id});
  if (result.error) throw result.error;
  const plan = result.data;
  if (plan?.companyId !== request.data.company_deletion_id ||
      !Array.isArray(plan.files) || !Array.isArray(plan.sharedFiles) ||
      !Array.isArray(plan.chatThreadIds) || typeof plan.complete !== 'boolean') {
    throw new Error('Invalid company inventory assessment');
  }
  // Return codes only: no paths, thread IDs, company IDs or other users' data.
  const codes = [];
  if (!plan.complete) codes.push('company_file_ownership_review_required');
  if (plan.sharedFiles.length) codes.push('company_shared_photos_cleanup_required');
  return {codes};
}
