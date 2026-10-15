export const completionLabels = { film: '필름 물량 · 자재비', labor: '인건비', meal: '식비', supplies: '부자재비', overhead: '공과잡비', expense: '기타 경비' };
export const headerFields = { company_name: '발행 업체명', representative: '대표자', company_phone: '연락처', business_number: '사업자번호', customer_name: '거래처 업체명 / 고객명', site_name: '현장명', address: '현장주소', work_date: '시공일', issued_date: '작성일', crew_count: '투입 인원 (명)', person_days: '연인원 (공수)', bank_account: '입금 계좌' };

// Blank required fields mean this estimate line is intentionally omitted.
// A blank optional unit price still preserves a manually entered total.
export function includedCompletionItem(row) {
  return [row.name, row.quantity, row.amount].every(value =>
    value != null && String(value).trim() !== ''
  );
}

export function completionTotals(items, vat = 'none') {
  const subtotal = items.filter(includedCompletionItem).reduce((sum, row) => sum + Number(row.amount || 0), 0);
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

const filmKey = (brand, code, name, unit) => JSON.stringify(
  [brand, code || name, unit || 'm'].map(value => String(value || '').trim().toLowerCase()),
);
const nonnegative = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

// Use the same confirmed usage as the site screen; never substitute issued stock for usage.
export function completionMaterials(actual = [], siteMaterials = []) {
  const groups = new Map();
  for (const row of siteMaterials) {
    const key = filmKey(row.brand, row.code, row.name, row.unit);
    const group = groups.get(key) || {
      category: 'film', name: [row.brand, row.code, row.name].filter(Boolean).join(' · ') || '필름',
      quantity: 0, unit: row.unit || 'm', amount: 0, quantityPending: false, pricePending: false, prices: [],
    };
    if (nonnegative(row.unitPrice)) group.prices.push(Number(row.unitPrice));
    if (nonnegative(row.used)) group.quantity += Number(row.used);
    else group.quantityPending = true;
    if (nonnegative(row.unitPrice) && nonnegative(row.used)) group.amount += Math.round(Number(row.used) * Number(row.unitPrice));
    else if (!nonnegative(row.unitPrice)) group.pricePending = true;
    groups.set(key, group);
  }
  const remaining = actual.filter(row => row.quantity == null || !groups.has(
    filmKey(row.brand, row.productCode, row.productName || row.product, row.unit),
  )).map(row => ({ category: row.quantity == null ? 'supplies' : 'film', name: [row.quantity == null ? '' : row.brand, row.product].filter(Boolean).join(' · '), quantity: row.quantity ?? 1, unit: row.unit || '식', amount: Math.round(Number(row.amount) || 0), unit_price: row.quantity > 0 ? Math.round(Number(row.amount) || 0) / row.quantity : null }));
  return [...groups.values()].map(row => ({
    ...row,
    unit_price: row.pricePending ? null : new Set(row.prices).size === 1 ? row.prices[0] : (!row.quantityPending && row.quantity > 0 ? row.amount / row.quantity : null),
    quantity: row.quantityPending ? '' : Math.round(row.quantity * 1000000) / 1000000,
    amount: row.quantityPending || row.pricePending ? 0 : row.amount,
  })).concat(remaining);
}


export function completionLabor(labor = []) {
  const groups = new Map();
  let extra = 0, unknown = 0, days = 0;
  const crew = new Set();
  for (const row of labor) {
    const amount = Math.round(Number(row.amount) || 0);
    if (amount <= 0) continue;
    if (row.workerId) crew.add(row.workerId);
    const parts = row.rateDays;
    // Preserve rate changes instead of inventing an average daily wage.
    if (Array.isArray(parts) && parts.length &&
        Math.round(parts.reduce((sum,p)=>sum+(p.rate+p.allowance)*p.days,0)) === amount) {
      for (const part of parts) {
        if (part.rate > 0) {
          const group = groups.get(part.rate) || { quantity:0, workers:new Set() };
          group.quantity += part.days;
          if(row.workerId) group.workers.add(row.workerId);
          groups.set(part.rate,group);
        }
        days += part.days;
        extra += part.allowance * part.days;
      }
    } else {
      // Explicit totals and overtime stay authoritative without exposing names.
      unknown += amount;
      if(Number(row.days)>0) days += Number(row.days);
    }
  }
  const items = [...groups].sort((a,b)=>b[0]-a[0]).map(([rate,g])=>({
    category:'labor', name:'인건비',
    quantity:g.quantity,unit:'공수',unit_price:rate,amount:Math.round(rate*g.quantity)
  }));
  if(extra>0) items.push({category:'labor',name:'팀장수당 합계',quantity:1,unit:'식',amount:Math.round(extra)});
  if(unknown>0) items.push({category:'labor',name:'직접 입력·완료보고·연장 인건비 합계',quantity:1,unit:'식',amount:unknown});
  return {items,crew:crew.size,days};
}

export function normalizeLaborNames(items = []) {
  return items.map(row => row.category === 'labor' && String(row.name || '').trim()
    ? { ...row, name: '인건비' } : row);
}

export function summarizeMeals(items = []) {
  const meals = items.filter(row => row.category === 'meal');
  if (!meals.length) return items;
  const amount = meals.reduce((sum,row)=>sum + Number(row.amount || 0),0);
  let added = false;
  return items.flatMap(row => {
    if(row.category !== 'meal') return [row];
    if(added) return [];
    added = true;
    return [{category:'meal',name:'식대 합계',quantity:1,unit:'식',unit_price:null,amount}];
  });
}

export function completionSeed(site, company, breakdown, siteMaterials = []) {
  const labor = breakdown.labor || [];
  const summary = completionLabor(labor);
  const amount = row => Math.round(Number(row.amount) || 0);
  const items = [
    ...completionMaterials(breakdown.material, siteMaterials),
    ...summary.items,
    ...(breakdown.expense || []).map(row => ({ category: /식대|식비/.test(row.category) ? 'meal' : /부자재/.test(row.category) ? 'supplies' : /공과|잡비/.test(row.category) ? 'overhead' : 'expense', name: `${row.category} · ${row.description}`, quantity: 1, unit: '식', amount: amount(row) })),
  ];
  return { items: normalizeLaborNames(summarizeMeals(items)), note: '', vat: 'none', version: 0, header: normalizeHeader({ company_name: company.company_name, representative: company.representative_name, company_phone: company.phone, customer_name: site.customer_name, site_name: site.site_name, address: [site.address, site.address_detail].filter(Boolean).join(' '), work_date: (site.work_dates || []).join(', ') || String(site.schedule_date || ''), issued_date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }), crew_count: summary.crew || '', person_days: summary.days || '' }) };
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

