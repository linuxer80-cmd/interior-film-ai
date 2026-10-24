export const MARKETING_COMPANY_ID = '2ddfe3d9-4411-4991-ae35-5b876be411bc';
export const canUseOnlineSales = companyId => companyId === MARKETING_COMPANY_ID;
export function credentials(body) {
  const advertiserId = String(body.advertiserId || '').trim();
  const apiKey = String(body.apiKey || '').trim();
  if (!/^[1-9]\d{0,18}$/.test(advertiserId)) throw Error('당근 광고주 ID를 숫자로 입력해주세요.');
  if (apiKey.length < 8 || apiKey.length > 4096 || /[^\x21-\x7e]/.test(apiKey)) throw Error('API 키를 확인해주세요.');
  return {advertiserId, apiKey};
}
export function reportingPeriod(now = new Date()) {
  const korea = new Date(now.getTime() + 9 * 3600000);
  const end = new Date(Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate()) - 86400000);
  const start = new Date(end.getTime() - 6 * 86400000);
  return {start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10)};
}
export function summarize(campaigns, performances) {
  const byId = new Map(campaigns.map(c => [c.id, {...c, impressions:0, clicks:0, cost:0}]));
  for (const p of performances) {
    const row = byId.get(p.id);
    if (!row) throw Error('요청한 캠페인과 성과 데이터가 다릅니다.');
    for (const [key, value] of [['impressions',p.impression], ['clicks',p.click], ['cost',p.cost]]) {
      if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw Error('당근 성과 응답 형식을 확인해주세요.');
      row[key] += Number(value);
    }
  }
  const rows = [...byId.values()].map(row => ({...row, ctr:row.impressions ? row.clicks / row.impressions * 100 : 0, cpc:row.clicks ? row.cost / row.clicks : null}));
  const totals = rows.reduce((a,r) => ({impressions:a.impressions+r.impressions,clicks:a.clicks+r.clicks,cost:a.cost+r.cost}), {impressions:0,clicks:0,cost:0});
  return {campaigns: rows, totals:{...totals,ctr:totals.impressions?totals.clicks/totals.impressions*100:0,cpc:totals.clicks?totals.cost/totals.clicks:null}, notes:[
    ...(rows.length ? [] : ['API에서 조회되는 캠페인이 없습니다. 간편모드 광고 등 현재 광고가 이 API에 포함되는지 당근에서 확인해주세요.']),
    ...rows.filter(r=>r.impressions>=100 && !r.clicks).map(r=>`${r.title}: 노출 ${r.impressions}회에 클릭이 없습니다. 소재와 지역 설정을 검토해주세요.`),
    'API로 조회된 캠페인만 집계합니다. 이 수치는 실제 상담·계약 건수가 아닙니다.'
  ]};
}
