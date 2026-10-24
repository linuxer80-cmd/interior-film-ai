import {createHmac} from 'node:crypto';
export const NAVER_CUSTOMER_ID='2149941';
export class NaverAdsError extends Error {
  constructor(message,status=502){super(message);this.publicMessage=message;this.status=status;}
}
export function naverCredentials(body){
  const customerId=String(body.customerId||'').trim();
  if(customerId!==NAVER_CUSTOMER_ID)throw new NaverAdsError('기분좋은공간의 네이버 광고계정 2149941만 연결할 수 있습니다.',400);
  const value={customerId};
  for(const key of ['apiKey','secretKey']){
    const text=String(body[key]||'').trim();
    if(text.length<8||text.length>4096||/[^\x21-\x7e]/.test(text))throw new NaverAdsError('액세스라이선스와 비밀키를 확인해주세요.',400);
    value[key]=text;
  }
  return value;
}
export function naverHeaders(credentials,path,timestamp=String(Date.now())){
  return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':timestamp,'X-API-KEY':credentials.apiKey,'X-Customer':credentials.customerId,'X-Signature':createHmac('sha256',credentials.secretKey).update(`${timestamp}.GET.${path}`).digest('base64')};
}
function client(credentials,fetcher){
  const deadline=Date.now()+45000;let calls=0;
  return async(path,query={})=>{
    if(++calls>45||Date.now()>deadline)throw new NaverAdsError('조회 범위가 커서 전체 집계를 완료하지 못했습니다. 기존 결과를 유지합니다.');
    let response;
    try{response=await fetcher(`https://api.searchad.naver.com${path}?${new URLSearchParams(query)}`,{method:'GET',headers:naverHeaders(credentials,path),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(10000,Math.max(1,deadline-Date.now())))});}
    catch{throw new NaverAdsError('네이버 광고 API에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');}
    if(!response.ok){
      const errors={401:'네이버 API 인증에 실패했습니다. 액세스라이선스와 비밀키를 확인해주세요.',403:'이 네이버 광고계정의 API 접근 권한을 확인해주세요.',429:'네이버 API 호출 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'};
      throw new NaverAdsError(errors[response.status]||'네이버 광고 API 조회가 실패했습니다. 기존 결과는 유지됩니다.',response.status===429?429:502);
    }
    try{return await response.json();}catch{throw new NaverAdsError('네이버 API 응답을 읽지 못했습니다.');}
  };
}
function accountRows(rows,credentials){
  if(rows.some(row=>row.customerId!=null&&String(row.customerId)!==credentials.customerId))throw new NaverAdsError('응답의 광고계정이 연결 계정과 일치하지 않습니다.');
}
async function list(call,path,query,idKey,credentials,max=5000){
  const result=[],seen=new Set();let cursor;
  for(let page=0;page<6;page++){
    const rows=await call(path,{...query,recordSize:'1000',selector:'NEXT',...(cursor?{baseSearchId:cursor}:{})});
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
  const result=new Map();
  for(let offset=0;offset<ids.length;offset+=100){
    const batch=ids.slice(offset,offset+100);
    const response=await call('/stats',{ids:batch.join(','),fields:JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']),timeRange:JSON.stringify({since:period.start,until:period.end}),timeIncrement:'allDays'});
    if(!Array.isArray(response.data))throw new NaverAdsError('네이버 성과 응답 형식을 확인해주세요.');
    for(const row of response.data){
      if(!batch.includes(row.id)||result.has(row.id))throw new NaverAdsError('요청 항목과 성과 응답이 일치하지 않습니다.');
      result.set(row.id,statMetrics(row));
    }
  }
  return result;
}
export async function loadNaverReport(credentials,period,fetcher=fetch){
  const call=client(credentials,fetcher);
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
  const complete=campaignRows.every(r=>r.impressions!==null&&r.clicks!==null&&r.cost!==null);
  const totals=complete?campaignRows.reduce((s,r)=>({impressions:s.impressions+r.impressions,clicks:s.clicks+r.clicks,cost:s.cost+r.cost}),{impressions:0,clicks:0,cost:0}):{impressions:null,clicks:null,cost:null};
  totals.ctr=totals.impressions>0?totals.clicks/totals.impressions*100:totals.impressions===0?0:null;totals.cpc=totals.clicks>0?totals.cost/totals.clicks:null;
  return {period,campaigns:campaignRows,groups,totals,complete,notes:[
    ...(!campaignRows.length?['API에서 조회된 파워링크 캠페인이 없습니다.']:[]),
    ...(!complete?['일부 성과가 제공되지 않아 전체 합계를 표시하지 않았습니다. 미제공 값은 0으로 계산하지 않습니다.']:[]),
    ...campaignRows.filter(c=>c.useDailyBudget!==true||Number(c.dailyBudget)>30000).map(c=>`${c.name}: 하루 예산 설정을 확인해주세요. 운영 기준은 30,000원입니다.`),
    '파워링크만 집계하며 광고비는 부가세 포함입니다. 상담·계약 성과와는 다릅니다.'
  ]};
}
export async function loadNaverKeywords(credentials,groupId,period,fetcher=fetch){
  if(!/^grp-[a-zA-Z0-9-]{1,100}$/.test(groupId))throw new NaverAdsError('광고그룹을 선택해주세요.',400);
  const call=client(credentials,fetcher),group=await call(`/ncc/adgroups/${groupId}`);
  accountRows([group],credentials);
  if(group.nccAdgroupId!==groupId||group.adgroupType!=='WEB_SITE')throw new NaverAdsError('파워링크 광고그룹만 조회할 수 있습니다.',400);
  const rows=await list(call,'/ncc/keywords',{nccAdgroupId:groupId},'nccKeywordId',credentials,3000);
  if(rows.some(k=>k.nccAdgroupId!==groupId))throw new NaverAdsError('광고그룹과 키워드가 일치하지 않습니다.');
  const metrics=await stats(call,rows.map(k=>k.nccKeywordId),period);
  return {period,groupId,groupName:group.name,keywords:rows.map(k=>({id:k.nccKeywordId,keyword:k.keyword,status:k.status,inspectStatus:k.inspectStatus,userLock:k.userLock,useGroupBidAmt:k.useGroupBidAmt,bidAmt:k.useGroupBidAmt?group.bidAmt:k.bidAmt,...(metrics.get(k.nccKeywordId)||statMetrics())})),fetchedAt:new Date().toISOString()};
}
