import { consultationItems } from './consultationQuote.js';

export const supplementLabels = {
  customer_name:'고객명', customer_phone:'전화번호', site_name:'현장명',
  address:'주소', address_detail:'상세주소', region:'지역',
  contract_amount:'계약금액', deposit_amount:'계약금 / 선금',
};
const key = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s.,()\-]/g,'');
const empty = value => value == null || ['', '미정', '미입력'].includes(String(value).trim());
const invalid = message => { throw Object.assign(Error(message), {status:400}); };

export function readableConsultationMemo(value) {
  return String(value || '').replace(/\[상담 추가 [\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\]/gi,'[추가 상담]');
}

export function appendConsultationText(oldValue, newValue) {
  let result = String(oldValue || '').trim();
  for (const line of String(newValue || '').split(/\r?\n/).map(v=>v.trim()).filter(Boolean)) {
    if (!key(result).includes(key(line))) result = [result,line].filter(Boolean).join('\n');
  }
  return result;
}

export function normalizeSupplement(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('상담 입력을 확인해주세요.');
  const data = {};
  for (const field of [...Object.keys(supplementLabels).filter(k=>!k.endsWith('_amount')),'work_type','work_description','memo','consultation_text']) {
    if (raw[field] != null && typeof raw[field] !== 'string') invalid('상담 입력 형식을 확인해주세요.');
    data[field] = String(raw[field] || '').trim();
    if (data[field].length > 12000) invalid('상담 내용이 너무 깁니다. 나누어 추가해주세요.');
  }
  for (const field of ['contract_amount','deposit_amount']) {
    const value = raw[field];
    data[field] = value == null || String(value).trim()==='' ? null : Number(value);
    if (data[field] !== null && (!Number.isSafeInteger(data[field]) || data[field]<0 || data[field]>999999999999)) invalid('금액은 0 이상의 정수로 입력해주세요.');
  }
  if (raw.work_dates != null && !Array.isArray(raw.work_dates)) invalid('시공 날짜를 확인해주세요.');
  data.work_dates = [...new Set(raw.work_dates || [])].sort();
  if (data.work_dates.length>366 || data.work_dates.some(d=>typeof d!=='string' || !/^20\d{2}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || new Date(d).toISOString().slice(0,10)!==d)) invalid('시공 날짜를 확인해주세요.');
  const seed=raw.consultation_quote_seed;
  if (seed?.items != null && (!Array.isArray(seed.items) || seed.items.length>60)) invalid('견적 항목은 60개까지 추가할 수 있습니다.');
  data.consultation_quote_seed={items:consultationItems(seed?.items),other_schedule:String(seed?.other_schedule || '').slice(0,4000)};
  return data;
}

// Both the confirmation screen and server use the same fill-only rules.
export function consultationSupplement(site, data) {
  const patch={}, filled=[], conflicts=[];
  for (const [field,label] of Object.entries(supplementLabels)) {
    const incoming=data[field];
    if (empty(incoming)) continue;
    if (empty(site[field])) {patch[field]=incoming;filled.push({field,label,value:incoming});}
    else if (key(site[field])!==key(incoming)) conflicts.push({field,label,before:site[field],after:incoming});
  }
  for (const field of ['work_type','work_description']) {
    const value=appendConsultationText(empty(site[field]) ? "" : site[field],data[field]);
    if (value!==String(site[field] || '').trim()) patch[field]=value;
  }
  // Older clients use the stored marker for retry detection; simplify only its display.
  let memo=String(site.memo || '');
  memo=appendConsultationText(memo,data.memo);
  memo=appendConsultationText(memo,data.consultation_text);
  const dates=data.work_dates || [];
  if (dates.length) {
    const existing=(site.work_dates || []).filter(Boolean);
    if (!existing.length && !site.schedule_date && !site.schedule_start && !site.schedule_end && ['consulting','scheduled'].includes(site.status)) {
      Object.assign(patch,{work_dates:dates,schedule_date:dates[0],schedule_start:new Date(`${dates[0]}T00:00:00+09:00`).toISOString(),schedule_end:new Date(`${dates.at(-1)}T17:00:00+09:00`).toISOString()});
      filled.push({field:'work_dates',label:'시공일',value:dates.join(', ')});
    } else if (dates.some(d=>!existing.includes(d) && d!==site.schedule_date && d!==String(site.schedule_start || '').slice(0,10))) {
      conflicts.push({field:'work_dates',label:'시공일',before:existing.join(', ') || site.schedule_date || site.schedule_start || '기존 일정',after:dates.join(', ')});
    }
  }
  for (const conflict of conflicts) memo=appendConsultationText(memo,`[추가 상담 확인] ${conflict.label}: ${conflict.after} (기존 값 유지)`);
  if (memo!==String(site.memo || '')) patch.memo=memo;
  const incoming=data.consultation_quote_seed;
  if (incoming?.items?.length || incoming?.other_schedule) patch.consultation_quote_seed=incoming;
  return {patch,filled,conflicts};
}
