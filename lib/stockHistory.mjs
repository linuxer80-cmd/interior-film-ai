export const stockHistoryActions = {
  receive: '입고', issue: '현장 반출', return: '현장 반납',
  correct_return: '반납량 수정', supplier_return: '대리점 반납',
};
export function stockHistoryRange(start, end) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end)) throw Error('조회 날짜를 확인해주세요.');
  const from = new Date(start + 'T00:00:00+09:00');
  const until = new Date(end + 'T00:00:00+09:00');
  until.setUTCDate(until.getUTCDate() + 1);
  if (until <= from || until - from > 31 * 86400000) throw Error('조회 기간은 시작일부터 최대 31일입니다.');
  return {from: from.toISOString(), until: until.toISOString()};
}
export function stockHistoryRows({events, issues, returns, trips, rolls, materials, sites, profiles, workers}) {
  const byId = rows => new Map(rows.map(row => [row.id, row]));
  const rollMap = byId(rolls), materialMap = byId(materials), siteMap = byId(sites);
  const rollMaterials = new Set(trips.map(t => t.material_id));
  const people = new Map(profiles.map(p => [p.id, {name:p.name || p.full_name || p.display_name || '', role:p.role}]));
  for (const w of workers) if (w.user_id) {
    const existing = people.get(w.user_id);
    if (!existing?.name) people.set(w.user_id, {name:w.name, role:existing?.role || 'worker'});
  }
  const person = id => {
    const p = people.get(id);
    if (!p) return '담당자 정보 없음';
    const label = p.role === 'owner' ? '관리자' : '시공자';
    return p.name ? `${p.name} (${label})` : `${label} · 이름 미등록`;
  };
  const rows = [];
  const add = (source, row, action, at, actor, quantity, roll, material) => {
    rows.push({id:`${source}:${row.id || row.material_id}`, action, at,
      actor:person(actor), brand:roll?.brand || material?.brand || '',
      code:roll?.product_code || material?.product_code || '',
      name:roll?.product_name || material?.product_name || '',
      roll:roll?.label || '', site:siteMap.get(row.site_id)?.site_name || '',
      quantity:quantity == null ? null : Number(quantity), unit:material?.unit || 'm',
      before:action === 'correct_return' ? Number(row.before_qty) : null,
      memo:row.memo || '', source,
      voided: Boolean(row.voided_at),
    });
  };
  for (const e of events) add('roll',e,e.action,e.created_at,e.actor,e.after_qty,rollMap.get(e.roll_id));
  for (const i of issues) if (!rollMaterials.has(i.material_id))
    add('manual-issue',i,'issue',i.created_at,i.created_by,i.quantity,null,materialMap.get(i.material_id));
  for (const r of returns) if (!rollMaterials.has(r.material_id))
    add('manual-return',r,'return',r.updated_at,r.updated_by,r.quantity,null,materialMap.get(r.material_id));
  return rows.sort((a,b) => new Date(b.at)-new Date(a.at) || b.id.localeCompare(a.id));
}
