import {createHash} from 'node:crypto';
import {naverHeaders,NaverAdsError,NAVER_CUSTOMER_ID} from './naverAds.mjs';

const normalize=value=>value.normalize('NFKC').replace(/\s/g,'').toLowerCase();
export function validateExpansion(input){
  if(!/^grp-[a-zA-Z0-9-]{1,100}$/.test(input.groupId||''))throw new NaverAdsError('광고그룹을 선택해주세요.',400);
  const bid=Number(input.bidAmt);
  if(!Number.isInteger(bid)||bid<70||bid>300||bid%10)throw new NaverAdsError('신규 키워드 입찰가는 70~300원, 10원 단위로 입력해주세요.',400);
  if(!Array.isArray(input.keywords)||!input.keywords.length||input.keywords.length>100)throw new NaverAdsError('한 번에 1~100개의 키워드를 입력해주세요.',400);
  const keywords=[...new Set(input.keywords.map(k=>{
    if(typeof k!=='string')throw new NaverAdsError('키워드 형식을 확인해주세요.',400);
    const v=k.normalize('NFKC').trim().replace(/\s+/g,' ');
    if(v.length>25||!v||/[^가-힣a-zA-Z0-9 ]/.test(v)||!/(필름|시트지)/.test(v)||!/(시공|견적|리폼|업체)/.test(v))throw new NaverAdsError('25자 이내의 필름·시트지 시공 관련 키워드만 등록할 수 있습니다.',400);
    return v;
  }))];
  return {groupId:input.groupId,bidAmt:bid,keywords};
}
export async function expandNaverKeywords(credentials,input,execute=false,fetcher=fetch){
  if(credentials.customerId!==NAVER_CUSTOMER_ID)throw new NaverAdsError('연결 계정을 확인해주세요.',403);
  const valid=validateExpansion(input),deadline=Date.now()+45000;
  async function request(path,query={},method='GET',body){
    let response;
    try{response=await fetcher(`https://api.searchad.naver.com${path}?${new URLSearchParams(query)}`,{method,headers:naverHeaders(credentials,path,String(Date.now()),method),...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))});}catch{throw new NaverAdsError(method==='POST'?'등록 응답을 확인하지 못했습니다. 일부 등록됐을 수 있으니 미리보기를 다시 실행해주세요.':'네이버 API 연결에 실패했습니다.');}
    if(!response.ok)throw new NaverAdsError(method==='POST'?`등록 응답 오류(HTTP ${response.status}). 일부 등록됐을 수 있으니 미리보기로 재확인해주세요.`:`광고 설정을 조회하지 못했습니다(HTTP ${response.status}).`,response.status===429?429:502);
    try{return await response.json();}catch{throw new NaverAdsError('응답을 읽지 못했습니다. 미리보기로 등록 여부를 재확인해주세요.');}
  }
  const group=await request(`/ncc/adgroups/${valid.groupId}`);
  if(String(group.customerId)!==NAVER_CUSTOMER_ID||group.nccAdgroupId!==valid.groupId||group.adgroupType!=='WEB_SITE'||group.userLock||group.status==='DELETED')throw new NaverAdsError('연결 계정의 운영 중인 파워링크 그룹을 선택해주세요.',400);
  const campaigns=await request('/ncc/campaigns');
  if(!Array.isArray(campaigns)||campaigns.some(c=>c.customerId!=null&&String(c.customerId)!==NAVER_CUSTOMER_ID))throw new NaverAdsError('계정의 예산을 확인하지 못했습니다.');
  const active=campaigns.filter(c=>c.campaignTp==='WEB_SITE'&&!c.userLock&&c.status!=='DELETED');
  if(!active.some(c=>c.nccCampaignId===group.nccCampaignId)||active.some(c=>c.useDailyBudget!==true||!Number.isFinite(Number(c.dailyBudget))||Number(c.dailyBudget)<=0)||active.reduce((n,c)=>n+Number(c.dailyBudget),0)>30000)throw new NaverAdsError('운영 중인 파워링크 캠페인 예산 합계가 30,000원 이하인지 확인해야 등록할 수 있습니다. 예산은 자동 변경하지 않습니다.',409);
  const rows=[],seen=new Set();let cursor;
  for(let page=0;page<4;page++){
    const batch=await request('/ncc/keywords',{nccAdgroupId:valid.groupId,recordSize:'1000',...(cursor?{baseSearchId:cursor,selector:'NEXT'}:{})});
    if(!Array.isArray(batch)||batch.some(k=>k.nccAdgroupId!==valid.groupId||k.customerId!=null&&String(k.customerId)!==NAVER_CUSTOMER_ID||!k.nccKeywordId||seen.has(k.nccKeywordId)))throw new NaverAdsError('키워드 목록을 완전히 확인하지 못했습니다.');
    for(const k of batch){seen.add(k.nccKeywordId);rows.push(k);}
    if(batch.length<1000)break;
    if(page===3)throw new NaverAdsError('키워드 목록이 조회 한도를 초과했습니다.');
    cursor=batch.at(-1).nccKeywordId;
  }
  const existing=new Set(rows.map(k=>normalize(k.keyword))),unique=new Set(),duplicates=[],fresh=[];
  for(const k of valid.keywords){const key=normalize(k);if(existing.has(key)||unique.has(key))duplicates.push(k);else{unique.add(key);fresh.push(k);}}
  const room=Math.max(0,1000-rows.length),keywords=fresh.slice(0,room),overflow=fresh.slice(room);
  const plan={groupId:valid.groupId,groupName:group.name,bidAmt:valid.bidAmt,existingCount:rows.length,keywords,duplicates,overflow};
  const planId=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  if(!execute)return {...plan,planId};
  if(input.planId!==planId)throw new NaverAdsError('광고 설정 또는 등록 목록이 변경됐습니다. 미리보기를 다시 확인해주세요.',409);
  if(!keywords.length)return {...plan,created:[],failed:[],uncertain:[]};
  // One bounded mutation only: never automatically retry a POST.
  const result=await request('/ncc/keywords',{nccAdgroupId:valid.groupId},'POST',keywords.map(keyword=>({keyword,bidAmt:valid.bidAmt,useGroupBidAmt:false,userLock:false})));
  if(!Array.isArray(result))throw new NaverAdsError('등록 결과를 확인하지 못했습니다. 미리보기로 재확인해주세요.');
  const created=[],failed=[],uncertain=[];
  for(const keyword of keywords){const r=result.find(r=>normalize(r.keyword||'')===normalize(keyword));if(r?.nccKeywordId&&r.nccAdgroupId===valid.groupId&&!r.error)created.push({keyword,id:r.nccKeywordId,status:r.status,inspectStatus:r.inspectStatus});else if(r?.error||r?.code)failed.push(keyword);else uncertain.push(keyword);}
  return {...plan,created,failed,uncertain};
}
