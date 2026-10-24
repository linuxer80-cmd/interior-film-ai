// Official spec: https://ads-openapi.kr.karrotmarket.com/ (v0.6.1)
// Keep this adapter read-only: POST /performance retrieves reports, not ad edits.
const ORIGIN = 'https://ads-openapi.kr.karrotmarket.com';
export class DaangnError extends Error {
  constructor(message, status=502) { super(message); this.status=status; this.publicMessage=message; }
}
async function call(path, credentials, fetcher, body) {
  let response;
  try {
    response = await fetcher(ORIGIN+path, {method:body?'POST':'GET',headers:{'X-API-KEY':credentials.apiKey,'X-ADVERTISER-ID':credentials.advertiserId,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  } catch { throw new DaangnError('당근 API에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'); }
  if (!response.ok) {
    const messages = {401:'API 키가 유효하지 않습니다. 당근에서 발급받은 키를 확인해주세요.',403:'이 광고계정의 API 접근 권한이 없습니다. 키와 광고주 ID를 확인해주세요.',429:'당근 API 호출 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'};
    throw new DaangnError(messages[response.status] || '당근 API 조회가 실패했습니다. 기존 데이터는 유지됩니다.', response.status===429?429:502);
  }
  try { return await response.json(); } catch { throw new DaangnError('당근 API 응답을 읽지 못했습니다.'); }
}
export async function loadDaangnReport(credentials, period, fetcher=fetch) {
  const campaigns=[];
  for(let page=1;page<=10;page++) {
    const data=await call(`/v1/campaigns?pageNumber=${page}&pageSize=100`,credentials,fetcher);
    if(!Array.isArray(data.campaigns)||!Number.isInteger(data.pagination?.totalPageCount)) throw new DaangnError('당근 캠페인 응답 형식을 확인해주세요.');
    for(const c of data.campaigns) {
      if(!c.id || !c.title || (c.advertiserId && String(c.advertiserId)!==credentials.advertiserId)) throw new DaangnError('광고주 ID와 캠페인 정보가 일치하지 않습니다.');
      if(campaigns.some(row=>row.id===c.id)) throw new DaangnError('캠페인 페이지가 중복되어 집계를 중단했습니다.');
      campaigns.push({id:c.id,title:c.title,liveStatus:c.liveStatus,status:c.status,type:c.type});
    }
    if(page>=data.pagination.totalPageCount) break;
    if(page===10) throw new DaangnError('캠페인이 조회 한도를 초과해 전체 집계를 중단했습니다.');
  }
  const performances=[];
  for(let i=0;i<campaigns.length;i+=50) {
    const data=await call('/v1/performance',credentials,fetcher,{analysisItem:'Campaign',ids:campaigns.slice(i,i+50).map(c=>c.id),timeGranularity:'DAY',startDateTime:`${period.start}T00:00:00+09:00`,endDateTime:`${period.end}T23:59:59+09:00`});
    if(!Array.isArray(data.performances))throw new DaangnError('당근 성과 응답 형식을 확인해주세요.');
    performances.push(...data.performances);
  }
  return {campaigns,performances};
}
