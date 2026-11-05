const reply = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control':'no-store'}});
export async function handleDeletionRequest(request, create, {authenticate, assessDeletionRequest, processRequest}) {
  try {
    const auth = await authenticate(request);
    if (!auth) return reply({ error: '로그인이 필요합니다.' }, 401);
    const { db, userId } = auth;
    if (create) {
      const body = await request.json().catch(() => null);
      if (body?.confirmation !== '계정 삭제 요청') return reply({ error: '삭제 요청 확인이 필요합니다.' }, 400);
      // Never trust a subject ID from the client. Concurrent retries retain
      // the original job, including its current processing/completion status.
      const { error } = await db.rpc('submit_account_deletion_request', { p_user: userId });
      if (error) throw error;
    }
    let { data, error } = await db.from('account_deletion_requests')
      .select('id,status,requested_at,updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    // Only a trusted server integration can supply a processor. Neither a body
    // field nor a query parameter can enable execution or choose its subject.
    if (create && data && typeof processRequest === 'function') {
      const outcome = await processRequest({db, userId, requestId: data.id});
      if (outcome?.status === 'completed') {
        return reply({request: {...data, status: 'completed'}, assessment: null,
          message: '계정 삭제가 완료되었습니다.'}, 200);
      }
      if (!outcome || !['busy','review_required'].includes(outcome.status)) {
        throw new Error('Invalid deletion processing result');
      }
      // A processor may have changed the durable status, or another lease may
      // already be processing it. Do not assess or display the pre-execution row.
      const latest = await db.from('account_deletion_requests')
        .select('id,status,requested_at,updated_at').eq('user_id', userId).maybeSingle();
      if (latest.error || !latest.data || latest.data.id !== data.id) {
        throw new Error('Deletion processing status unavailable');
      }
      data = latest.data;
    }
    let assessment = null;
    if (data?.status === 'review_required') {
      try {
        assessment = await assessDeletionRequest(db, userId);
      } catch {
        // An assessment outage must not hide a successfully persisted request.
        // This is display-only: the executor still rejects failed preflight checks.
        assessment = { code: 'assessment_unavailable', executable: false };
      }
    }
    return reply({ request: data, assessment, message: data ? '삭제 요청 상태입니다. 접수는 삭제 완료를 의미하지 않습니다.' : '접수된 삭제 요청이 없습니다.' }, create ? 202 : 200);
  } catch {
    return reply({ error: '삭제 요청 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
