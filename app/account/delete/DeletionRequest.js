'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clearDeletedAccountSession } from '../../../lib/accountDeletionSession.mjs';
import { supabase } from '../../../lib/supabase';

const labels = { review_required: '접수 완료 · 처리 범위 확인 중', processing: '삭제 처리 중', failed: '처리 중 문제가 발생했습니다. 고객지원에 문의해 주세요.', completed: '삭제 처리 완료' };
export default function DeletionRequest() {
  const [request, setRequest] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  const assessmentCodes = Array.isArray(assessment?.codes) ? assessment.codes : [assessment?.code];
  async function load(create = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.getSession();
      if (authError) throw new Error('로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.');
      const token = data?.session?.access_token;
      if (!token) { setLogin(true); setRequest(null); setAssessment(null); return; }
      setLogin(false);
      const response = await fetch('/api/account/deletion', {
        method: create ? 'POST' : 'GET', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(create ? { body: JSON.stringify({ confirmation: '계정 삭제 요청' }) } : {}),
      });
      const result = await response.json();
      if (response.status === 401) { setLogin(true); setRequest(null); setAssessment(null); }
      if (!response.ok) throw new Error(result.error || '요청을 확인하지 못했습니다.');
      setRequest(result.request);
      setAssessment(result.assessment);
      if (result.request?.status === 'completed') {
        await clearDeletedAccountSession(supabase, data.session?.user?.id);
      }
    } catch (e) { setError(e.message || '요청 처리 중 오류가 발생했습니다.'); }
    finally { lock.current = false; setBusy(false); }
  }
  useEffect(() => { load(); }, []);
  return <section aria-label="내 계정 삭제 요청" aria-busy={busy}>
    <h2>내 계정 삭제 요청</h2>
    <p>계정 삭제를 요청합니다. 업체의 마지막 관리자라면 업체의 모든 기록도 삭제 대상에 포함됩니다. 다른 이용자의 개인 계정은 삭제하지 않습니다. 삭제 범위 확인이 완료되면 계정과 자료가 영구 삭제됩니다. 추가 확인이 필요하면 검토 상태로 접수됩니다.</p>
    {login ? <p><Link href="/login">로그인 후 요청하기</Link></p> : request ?
      <p role="status">{labels[request.status] || '처리 상태를 확인해 주세요.'}</p> :
      <form onSubmit={e => { e.preventDefault(); if (confirmed && !busy) load(true); }}>
        <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /> 본인 계정과, 마지막 관리자일 경우 업체 전체 기록의 삭제를 요청합니다.</label>
        <p><button type="submit" disabled={!confirmed || busy}>계정 및 데이터 삭제 요청</button></p>
      </form>}
    {error && <p role="alert">{error}</p>}
    {assessmentCodes.includes('assessment_unavailable') && <p role="status">삭제 요청은 접수되어 있습니다. 현재 처리 범위를 확인하지 못했습니다. 잠시 후 ‘처리 상태 새로고침’을 눌러 주세요. 삭제가 새로 시작되지는 않습니다.</p>}
    {assessmentCodes.includes('dealer_transfer_required') && <p>대리점 담당 계정입니다. 주문 처리 담당자를 인계한 뒤 계정 삭제를 진행해야 합니다.</p>}
    {assessmentCodes.includes('open_orders_review_required') && <p>진행 중인 자재 주문이 있습니다. 주문을 완료하거나 담당자를 인계한 뒤 삭제 범위를 확인해야 합니다.</p>}
    {assessmentCodes.includes('delivery_privacy_review_required') && <p>주문 배송정보 또는 저장된 배송지가 있습니다. 본인과 다른 수령인의 정보를 구분해 삭제·보관 범위를 확인해야 합니다. 아직 삭제가 시작되지 않았습니다.</p>}
    {assessmentCodes.includes('linked_records_review_required') && <p>정산·업체 연결 등 관련 기록의 처리 범위를 확인하고 있습니다. 아직 삭제가 시작되지 않았습니다.</p>}
    {assessmentCodes.includes('shared_account_review_required') && <p>다른 서비스에서도 사용하는 계정입니다. 해당 서비스 이용에 영향을 주지 않도록 이 앱의 자료 삭제 범위를 확인합니다.</p>}
    {assessmentCodes.includes('company_deletion_required') && <p>업체의 마지막 관리자이므로 업체 전체 기록도 삭제 대상입니다. 현장·견적·정산·자재·사진 등 연결 자료를 확인하고 있습니다.</p>}
    {assessmentCodes.includes('company_file_ownership_review_required') && <p>이전 사진·첨부파일의 업체 소유 관계를 확인해야 합니다. 소유 업체가 불명확한 파일은 자동으로 삭제하지 않습니다.</p>}
    {assessmentCodes.includes('company_shared_photos_cleanup_required') && <p>다른 곳에서도 참조하는 업체 사진이 있습니다. 업체 소유 원본을 삭제할 때 연결된 사진 참조도 함께 정리합니다.</p>}
    {assessmentCodes.includes('company_scope_unavailable') && <p>현재 업체 자료의 삭제 범위를 조회하지 못했습니다. 접수는 유지되며, 처리 상태를 새로고침해 다시 확인할 수 있습니다.</p>}
    {assessmentCodes.includes('data_scope_review_required') && <p>공동 현장 기록과 개인 자료의 삭제·보관 범위를 확인해야 합니다. 자동 삭제는 아직 시작되지 않았습니다.</p>}
    {request?.status === 'completed' ? <p><Link href="/login">로그인 화면으로 이동</Link></p> : <button type="button" disabled={busy} onClick={() => load()}>{busy ? '확인 중…' : '처리 상태 새로고침'}</button>}
  </section>;
}
