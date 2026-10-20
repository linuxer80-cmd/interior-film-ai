"use client";
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import HomeReturnButton from '../../components/HomeReturnButton';
import { reportRequest } from '../../utils/reportClient';
import '../../components/laborMarket.css';
const SiteInventory = dynamic(() => import('./SiteInventory'));
const metres = value => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 });

export default function WorkerInventory() {
  const [tab, setTab] = useState('warehouse');
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (tab !== 'warehouse') return;
    let alive = true;
    setLoading(true); setData(null); setError('');
    reportRequest(`/api/worker/warehouse?${new URLSearchParams({ ...(companyId ? { companyId } : {}), q: query, page: String(page) })}`)
      .then(result => { if (alive) setData(result); })
      .catch(cause => { if (alive) setError(cause.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, companyId, query, page, attempt]);
  return <main className="labor-shell">
    <nav><HomeReturnButton /><button disabled={loading && tab === 'warehouse'} onClick={() => setAttempt(n => n + 1)}>새로고침</button></nav>
    <h1>업체 창고 재고</h1>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
      {['warehouse','site'].map(key => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)} style={{ padding: 13, borderRadius: 12, border: '1px solid #d8e1d0', background: tab === key ? '#355d46' : '#fffefb', color: tab === key ? '#fff' : '#355d46' }}>{key === 'warehouse' ? '업체 창고 전체' : '담당 현장 자재'}</button>)}
    </div>
    {tab === 'site' ? <SiteInventory embedded /> : <>
      <p>현장 배정이나 팀장 여부와 관계없이, 연결된 업체의 창고 필름을 검색할 수 있습니다.</p>
      {data?.companies && <label>업체 선택<select aria-label="창고 업체 선택" value={companyId || data.selectedCompany?.id || ''} onChange={event => { setCompanyId(event.target.value); setPage(0); }} style={{ display: 'block', width: '100%', marginTop: 8 }}>
        <option value="">업체를 선택해주세요</option>{data.companies.map(company => <option key={company.id} value={company.id}>{company.company_name}</option>)}
      </select></label>}
      <form onSubmit={event => { event.preventDefault(); setPage(0); setQuery(search.trim()); }} style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input aria-label="창고 재고 검색" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="제품번호 · 브랜드 · 보관 위치 · 롤 번호" style={{ minWidth: 0, flex: 1, fontSize: 16 }} />
        <button type="submit">검색</button>
      </form>
      {loading && <p role="status">창고 재고를 확인하고 있습니다…</p>}
      {error && <aside role="alert">{error}<button onClick={() => setAttempt(n => n + 1)}>다시 확인</button></aside>}
      {data?.message && <aside>{data.message}</aside>}
      {data?.state === 'choose_company' && <p>조회할 업체를 선택해주세요.</p>}
      {data?.state === 'available' && <>
        <p style={{ color: '#68785f', fontSize: 13 }}>{data.selectedCompany.company_name} · 검색 결과 {data.total}종 / {data.rollCount}롤 / {metres(data.metres)}m</p>
        <small>현재 창고에 보관 중인 잔량입니다. 반출 중인 롤과 매입단가는 표시하지 않습니다.</small>
        {!data.groups.length && <p>검색 조건에 맞는 창고 재고가 없습니다.</p>}
        {data.groups.map(group => <article key={group.key} style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{group.brand} {group.code}</strong><b>{metres(group.metres)}m</b></div>
          <details><summary style={{ cursor: 'pointer', marginTop: 10 }}>{group.rollCount}롤 · 보관 위치와 롤 번호 보기</summary>
            {group.rolls.map(roll => <div key={roll.id} style={{ padding: '12px 0', borderTop: '1px solid #e2e7da', overflowWrap: 'anywhere' }}><b>{metres(roll.remaining)}m</b> · {roll.location || '위치 미등록'}<small style={{ display: 'block' }}>{roll.label || '롤 이름 미등록'}</small></div>)}
            {group.limitedRolls && <small>롤 상세는 앞 100개만 표시합니다. 롤 번호로 검색하면 범위를 좁힐 수 있습니다.</small>}
          </details>
        </article>)}
        {(page > 0 || data.hasMore) && <div style={{ display: 'flex', gap: 10 }}><button disabled={page === 0} onClick={() => setPage(n => n - 1)}>이전</button><span>{page + 1}페이지</span><button disabled={!data.hasMore} onClick={() => setPage(n => n + 1)}>다음</button></div>}
      </>}
    </>}
  </main>;
}
