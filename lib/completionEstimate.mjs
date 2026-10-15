export const completionLabels = { film: '자재비', labor: '인건비', meal: '식비', supplies: '부자재비', overhead: '공과잡비', expense: '기타 경비' };
export const headerFields = { company_name: '발행 업체명', representative: '대표자', company_phone: '연락처', business_number: '사업자번호', customer_name: '거래처 업체명 / 고객명', site_name: '현장명', address: '현장주소', work_date: '시공일', issued_date: '작성일', crew_count: '투입 인원 (명)', person_days: '연인원 (공수)', bank_account: '입금 계좌' };

export function completionTotals(items, vat = 'none') {
  const subtotal = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const tax = vat === 'separate' ? Math.round(subtotal * 0.1) : vat === 'included' ? subtotal - Math.round(subtotal / 1.1) : 0;
  return { subtotal, supply: vat === 'included' ? subtotal - tax : subtotal, tax, total: vat === 'separate' ? subtotal + tax : subtotal };
}

export function normalizeHeader(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('견적서 기본정보를 확인해주세요.');
  return Object.fromEntries(Object.keys(headerFields).map(key => {
    const text = String(value[key] ?? '').trim();
    if (text.length > 500) throw Error(`${headerFields[key]}은 500자 이하로 입력해주세요.`);
    if (['crew_count', 'person_days'].includes(key) && text && (!Number.isFinite(Number(text)) || Number(text) < 0 || Number(text) > 1000000 || (key === 'crew_count' && !Number.isInteger(Number(text))))) throw Error('투입 인원과 공수를 확인해주세요.');
    return [key, text];
  }));
}

export function completionSeed(site, company, breakdown) {
  const labor = breakdown.labor || [];
  const known = labor.filter(row => Number.isFinite(row.days) && row.days > 0);
  const crew = new Set(labor.map(row => row.workerId).filter(Boolean));
  const amount = row => Math.round(Number(row.amount) || 0);
  const items = [
    ...(breakdown.material || []).map(row => ({ category: row.quantity == null ? 'supplies' : 'film', name: [row.quantity == null ? '' : row.brand, row.product].filter(Boolean).join(' · '), quantity: row.quantity ?? 1, unit: row.unit || '식', amount: amount(row) })),
    ...labor.map(row => ({ category: 'labor', name: `${row.name} · ${row.description}`, quantity: row.days > 0 ? row.days : row.hours > 0 ? row.hours : 1, unit: row.days > 0 ? '공수' : row.hours > 0 ? '시간' : '식', amount: amount(row) })),
    ...(breakdown.expense || []).map(row => ({ category: /식대|식비/.test(row.category) ? 'meal' : /부자재/.test(row.category) ? 'supplies' : /공과|잡비/.test(row.category) ? 'overhead' : 'expense', name: `${row.category} · ${row.description}`, quantity: 1, unit: '식', amount: amount(row) })),
  ];
  return { items, note: '', vat: 'none', version: 0, header: normalizeHeader({ company_name: company.company_name, representative: company.representative_name, company_phone: company.phone, customer_name: site.customer_name, site_name: site.site_name, address: [site.address, site.address_detail].filter(Boolean).join(' '), work_date: (site.work_dates || []).join(', ') || String(site.schedule_date || ''), issued_date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }), crew_count: crew.size || '', person_days: known.length ? known.reduce((sum, row) => sum + row.days, 0) : '' }) };
}

// Explicit totals remain authoritative; changing quantity alone never silently alters a legacy amount.
export function editCompletionItem(row, key, value) {
  const next = { ...row, [key]: value };
  if ((key === 'unit_price' && value != null && value !== '') || (key === 'quantity' && row.unit_price != null && row.unit_price !== '')) {
    next.amount = Math.round(Number(next.quantity || 0) * Number(next.unit_price || 0));
  }
  if (key === 'amount') next.unit_price = null;
  return next;
}
