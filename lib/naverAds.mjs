import {createHmac} from 'node:crypto';
export const NAVER_CUSTOMER_ID='1051808';
export class NaverAdsError extends Error {
  constructor(message,status=502){super(message);this.publicMessage=message;this.status=status;}
}
export function naverCredentials(body){
  const customerId=String(body.customerId||'').trim();
  if(customerId!==NAVER_CUSTOMER_ID)throw new NaverAdsError('기분좋은공간의 네이버 API 고객번호 1051808만 연결할 수 있습니다.',400);
  const value={customerId};
  for(const key of ['apiKey','secretKey']){
    const text=String(body[key]||'').trim();
    if(text.length<8||text.length>4096||/[^\x21-\x7e]/.test(text))throw new NaverAdsError('액세스라이선스와 비밀키를 확인해주세요.',400);
    value[key]=text;
  }
  return value;
}
export function naverHeaders(credentials,path,timestamp=String(Date.now()),method='GET'){
  return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':timestamp,'X-API-KEY':credentials.apiKey,'X-Customer':credentials.customerId,'X-Signature':createHmac('sha256',credentials.secretKey).update(`${timestamp}.${method}.${path}`).digest('base64')};
}
export function naverReadClient(credentials,fetcher=fetch,{deadline=Date.now()+45000,maxCalls=45}={}){
  let calls=0;
  return async(path,query={})=>{
    if(++calls>maxCalls||Date.now()>deadline)throw new NaverAdsError('조회 범위가 커서 전체 집계를 완료하지 못했습니다. 기존 결과를 유지합니다.');
    let response;
    try{response=await fetcher(`https://api.searchad.naver.com${path}?${new URLSearchParams(query)}`,{method:'GET',headers:naverHeaders(credentials,path),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(10000,Math.max(1,deadline-Date.now())))});}
    catch{throw new NaverAdsError('네이버 광고 API에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');}
    if(!response.ok){
      let providerCode;
      try{const failure=await response.json();if(Number.isSafeInteger(Number(failure?.code)))providerCode=Number(failure.code);}catch{}
      console.warn('NAVER_ADS_API_ERROR',{path,status:response.status,code:providerCode});
      const errors={401:'네이버 API 인증에 실패했습니다. 액세스라이선스와 비밀키를 확인해주세요.',403:'이 네이버 광고계정의 API 접근 권한을 확인해주세요.',429:'네이버 API 호출 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'};
      throw new NaverAdsError(errors[response.status]||`네이버 광고 API 조회가 실패했습니다. (HTTP ${response.status}${providerCode!=null?`, 코드 ${providerCode}`:''}) 기존 결과는 유지됩니다.`,response.status===429?429:502);
    }
    try{return await response.json();}catch{throw new NaverAdsError('네이버 API 응답을 읽지 못했습니다.');}
  };
}
const client=naverReadClient;
function accountRows(rows,credentials){
  if(rows.some(row=>row.customerId!=null&&String(row.customerId)!==credentials.customerId))throw new NaverAdsError('응답의 광고계정이 연결 계정과 일치하지 않습니다.');
}
async function list(call,path,query,idKey,credentials,max=5000){
  const result=[],seen=new Set();let cursor;
  for(let page=0;page<6;page++){
    const rows=await call(path,{...query,recordSize:'1000',...(cursor?{baseSearchId:cursor,selector:'NEXT'}:{})});
    if(!Array.isArray(rows))throw new NaverAdsError('네이버 광고 목록 응답 형식을 확인해주세요.');
    accountRows(rows,credentials);
    for(const row of rows){
      if(!row[idKey]||seen.has(row[idKey]))throw new NaverAdsError('광고 목록이 중복되거나 누락되어 조회를 중단했습니다.');
      seen.add(row[idKey]);result.push(row);
    }
    if(result.length>max)throw new NaverAdsError('광고 목록이 조회 한도를 초과했습니다. 전체 집계를 중단합니다.');
    if(rows.length<1000)return result;
    cursor=rows.at(-1)[idKey];
  }
  throw new NaverAdsError('광고 목록의 마지막 페이지를 확인하지 못했습니다.');
}
function metric(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;}
export function statMetrics(row){
  if(!row)return {impressions:null,clicks:null,cost:null,ctr:null,cpc:null,averageRank:null};
  const impressions=metric(row.impCnt),clicks=metric(row.clkCnt),cost=metric(row.salesAmt),rank=metric(row.avgRnk);
  return {impressions,clicks,cost,ctr:impressions>0&&clicks!==null?clicks/impressions*100:impressions===0?0:null,cpc:clicks>0&&cost!==null?cost/clicks:null,averageRank:rank>0?rank:null};
}
async function stats(call,ids,period){
  const result=new Map(),families=new Map();
  // NAVER rejects mixed entity kinds in one /stats request (official issue #996).
  for(const id of ids){const kind=id.split('-')[0];if(!families.has(kind))families.set(kind,[]);families.get(kind).push(id);}
  for(const entityIds of families.values())for(let offset=0;offset<entityIds.length;offset+=100){
    const batch=entityIds.slice(offset,offset+100);
    const response=await call('/stats',{ids:batch.join(','),fields:JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']),timeRange:JSON.stringify({since:period.start,until:period.end}),timeIncrement:'allDays'});
    if(!Array.isArray(response.data))throw new NaverAdsError('네이버 성과 응답 형식을 확인해주세요.');
    for(const row of response.data){
      if(!batch.includes(row.id)||result.has(row.id))throw new NaverAdsError('요청 항목과 성과 응답이 일치하지 않습니다.');
      result.set(row.id,statMetrics(row));
    }
  }
  return result;
}
export async function loadNaverReport(credentials,period,fetcher=fetch,options={}){
  const call=options.call||client(credentials,fetcher);
  const rawCampaigns=await list(call,'/ncc/campaigns',{campaignType:'WEB_SITE'},'nccCampaignId',credentials,1000);
  const campaigns=rawCampaigns.filter(c=>c.campaignTp==='WEB_SITE');
  const rawGroups=[];
  for(const c of campaigns){
    const rows=await list(call,'/ncc/adgroups',{nccCampaignId:c.nccCampaignId},'nccAdgroupId',credentials);
    if(rows.some(g=>g.nccCampaignId!==c.nccCampaignId))throw new NaverAdsError('캠페인과 광고그룹이 일치하지 않습니다.');
    rawGroups.push(...rows.filter(g=>g.adgroupType==='WEB_SITE'));
  }
  const metrics=await stats(call,[...campaigns.map(c=>c.nccCampaignId),...rawGroups.map(g=>g.nccAdgroupId)],period);
  const campaignRows=campaigns.map(c=>({id:c.nccCampaignId,name:c.name,status:c.status,userLock:c.userLock,useDailyBudget:c.useDailyBudget,dailyBudget:c.dailyBudget,...(metrics.get(c.nccCampaignId)||statMetrics())}));
  const groups=rawGroups.map(g=>({id:g.nccAdgroupId,campaignId:g.nccCampaignId,name:g.name,status:g.status,userLock:g.userLock,bidAmt:g.bidAmt,useDailyBudget:g.useDailyBudget,dailyBudget:g.dailyBudget,...(metrics.get(g.nccAdgroupId)||statMetrics())}));
  return normalizeNaverSnapshot({period,campaigns:campaignRows,groups,notes:[
    ...(!campaignRows.length?['API에서 조회된 파워링크 캠페인이 없습니다.']:[]),
    ...campaignRows.filter(c=>c.useDailyBudget!==true||Number(c.dailyBudget)>30000).map(c=>`${c.name}: 하루 예산 설정을 확인해주세요. 운영 기준은 30,000원입니다.`),
    '파워링크만 집계하며 광고비는 부가세 포함입니다. 상담·계약 성과와는 다릅니다.'
  ]});
}
export function normalizeNaverSnapshot(snapshot){
  if(!snapshot||!Array.isArray(snapshot.campaigns))return snapshot;
  const reported=snapshot.campaigns.filter(row=>['impressions','clicks','cost'].every(key=>Number.isFinite(row[key])&&row[key]>=0));
  const total=snapshot.campaigns.length,complete=reported.length===total;
  const totals=reported.length||!total?reported.reduce((s,r)=>({impressions:s.impressions+r.impressions,clicks:s.clicks+r.clicks,cost:s.cost+r.cost}),{impressions:0,clicks:0,cost:0}):{impressions:null,clicks:null,cost:null};
  totals.ctr=totals.impressions>0?totals.clicks/totals.impressions*100:totals.impressions===0?0:null;
  totals.cpc=totals.clicks>0?totals.cost/totals.clicks:null;
  const notes=(snapshot.notes||[]).filter(note=>!note.startsWith('일부 성과가 제공되지 않아')&&!note.startsWith('확인된 성과 합계:'));
  if(!complete)notes.unshift(`확인된 성과 합계: 전체 ${total}개 중 ${reported.length}개 캠페인을 집계했습니다. 성과 미제공 ${total-reported.length}개는 제외했으며 0으로 계산하지 않습니다.`);
  return {...snapshot,totals,complete,coverage:{total,reported:reported.length,missing:total-reported.length},notes};
}

export async function loadNaverKeywords(credentials,groupId,period,fetcher=fetch,options={}){
  if(!/^grp-[a-zA-Z0-9-]{1,100}$/.test(groupId))throw new NaverAdsError('광고그룹을 선택해주세요.',400);
  const call=options.call||client(credentials,fetcher),group=await call(`/ncc/adgroups/${groupId}`);
  accountRows([group],credentials);
  if(group.nccAdgroupId!==groupId||group.adgroupType!=='WEB_SITE')throw new NaverAdsError('파워링크 광고그룹만 조회할 수 있습니다.',400);
  const rows=await list(call,'/ncc/keywords',{nccAdgroupId:groupId},'nccKeywordId',credentials,3000);
  if(rows.some(k=>k.nccAdgroupId!==groupId))throw new NaverAdsError('광고그룹과 키워드가 일치하지 않습니다.');
  const metrics=await stats(call,rows.map(k=>k.nccKeywordId),period);
  return {period,groupId,groupName:group.name,keywords:rows.map(k=>({id:k.nccKeywordId,keyword:k.keyword,status:k.status,inspectStatus:k.inspectStatus,userLock:k.userLock,useGroupBidAmt:k.useGroupBidAmt,bidAmt:k.useGroupBidAmt?group.bidAmt:k.bidAmt,...(metrics.get(k.nccKeywordId)||statMetrics())})),fetchedAt:new Date().toISOString()};
}
