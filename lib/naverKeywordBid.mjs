import {naverHeaders,NaverAdsError,NAVER_CUSTOMER_ID} from './naverAds.mjs';

export function validateBidChange(input){
  if(!/^nkw-[a-zA-Z0-9-]{1,100}$/.test(input.keywordId||'')||!/^grp-[a-zA-Z0-9-]{1,100}$/.test(input.groupId||''))throw new NaverAdsError('수정할 키워드를 다시 조회해주세요.',400);
  const {bidAmt,expectedBidAmt,expectedUseGroupBidAmt}=input;
  if(!Number.isSafeInteger(bidAmt)||bidAmt<70||bidAmt>100000||bidAmt%10||!Number.isSafeInteger(expectedBidAmt)||expectedBidAmt<70||typeof expectedUseGroupBidAmt!=='boolean')throw new NaverAdsError('입찰가는 70~100,000원, 10원 단위로 입력해주세요.',400);
  const maxChange=Math.max(10,Math.floor(expectedBidAmt*0.1/10)*10);
  if(Math.abs(bidAmt-expectedBidAmt)>maxChange)throw new NaverAdsError(`한 번에 ${maxChange.toLocaleString('ko-KR')}원 이내로 조정해주세요.`,400);
  if(bidAmt===expectedBidAmt&&!expectedUseGroupBidAmt)throw new NaverAdsError('변경할 입찰가를 입력해주세요.',400);
  return {keywordId:input.keywordId,groupId:input.groupId,bidAmt,expectedBidAmt,expectedUseGroupBidAmt};
}

export async function updateNaverKeywordBid(credentials,input,fetcher=fetch){
  if(credentials.customerId!==NAVER_CUSTOMER_ID)throw new NaverAdsError('연결 계정을 확인해주세요.',403);
  const value=validateBidChange(input),deadline=Date.now()+45000;
  async function request(path,query={},method='GET',body){
    let response;
    try{response=await fetcher(`https://api.searchad.naver.com${path}?${new URLSearchParams(query)}`,{method,headers:naverHeaders(credentials,path,String(Date.now()),method),...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});}
    catch{throw new NaverAdsError(method==='PUT'?'변경 응답을 확인하지 못했습니다. 이미 저장됐을 수 있으니 키워드를 다시 조회해주세요.':'네이버 API 조회에 실패했습니다. 키워드를 다시 조회해주세요.');}
    if(!response.ok)throw new NaverAdsError(method==='PUT'?`변경 결과를 확인하지 못했습니다(HTTP ${response.status}). 다시 저장하지 말고 키워드를 재조회해주세요.`:`입찰 설정 조회에 실패했습니다(HTTP ${response.status}).`,response.status===429?429:502);
    try{return await response.json();}catch{throw new NaverAdsError('응답을 읽지 못했습니다. 다시 저장하지 말고 키워드를 재조회해주세요.');}
  }
  const keyword=await request(`/ncc/keywords/${value.keywordId}`);
  const group=await request(`/ncc/adgroups/${value.groupId}`);
  const owns=row=>row&&String(row.customerId)===NAVER_CUSTOMER_ID;
  if(!owns(keyword)||!owns(group)||keyword.nccKeywordId!==value.keywordId||keyword.nccAdgroupId!==value.groupId||group.nccAdgroupId!==value.groupId||group.adgroupType!=='WEB_SITE'||keyword.status==='DELETED'||group.status==='DELETED')throw new NaverAdsError('연결 계정의 파워링크 키워드만 수정할 수 있습니다.',403);
  const before=keyword.useGroupBidAmt?Number(group.bidAmt):Number(keyword.bidAmt);
  if(before!==value.expectedBidAmt||keyword.useGroupBidAmt!==value.expectedUseGroupBidAmt)throw new NaverAdsError('입찰 설정이 변경됐습니다. 키워드를 다시 조회한 후 수정해주세요.',409);
  const campaigns=await request('/ncc/campaigns');
  if(!Array.isArray(campaigns)||campaigns.some(c=>!owns(c)))throw new NaverAdsError('연결 계정의 캠페인 예산을 확인하지 못했습니다.');
  const active=campaigns.filter(c=>c.campaignTp==='WEB_SITE'&&!c.userLock&&c.status!=='DELETED');
  if(!active.some(c=>c.nccCampaignId===group.nccCampaignId)||active.some(c=>c.useDailyBudget!==true||!Number.isFinite(Number(c.dailyBudget))||Number(c.dailyBudget)<=0)||active.reduce((n,c)=>n+Number(c.dailyBudget),0)>30000)throw new NaverAdsError('운영 중인 파워링크 캠페인 예산 합계가 30,000원 이하일 때만 수정할 수 있습니다.',409);
  // Official keyword bid update: exactly one PUT. Never retry an uncertain write.
  await request('/ncc/keywords',{fields:'bidAmt'},'PUT',[{nccKeywordId:value.keywordId,nccAdgroupId:value.groupId,bidAmt:value.bidAmt,useGroupBidAmt:false}]);
  let saved;
  try{saved=await request(`/ncc/keywords/${value.keywordId}`);}catch{throw new NaverAdsError('변경 요청 후 저장값 재확인에 실패했습니다. 이미 저장됐을 수 있으니 키워드를 다시 조회해주세요.');}
  if(!owns(saved)||saved.nccKeywordId!==value.keywordId||saved.nccAdgroupId!==value.groupId||Number(saved.bidAmt)!==value.bidAmt||saved.useGroupBidAmt!==false)throw new NaverAdsError('변경 요청 후 저장값이 일치하지 않습니다. 다시 저장하지 말고 키워드를 재조회해주세요.',409);
  return {keywordId:value.keywordId,groupId:value.groupId,keyword:keyword.keyword,previousBidAmt:before,previousUseGroupBidAmt:keyword.useGroupBidAmt,bidAmt:value.bidAmt,useGroupBidAmt:false,verified:true,verifiedAt:new Date().toISOString()};
}
