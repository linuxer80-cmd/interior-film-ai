import {NAVER_CUSTOMER_ID,NaverAdsError,naverReadClient,naverHeaders,loadNaverReport,loadNaverKeywords} from './naverAds.mjs';
const rank=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
export function parseRecentRanks(response,ids){
 if(!Array.isArray(response?.data))throw new NaverAdsError('최근 순위 응답을 읽지 못했습니다.');
 const found=new Map();
 for(const row of response.data){
  if(!ids.includes(row.id)||found.has(row.id))throw new NaverAdsError('최근 순위 응답이 요청 항목과 일치하지 않습니다.');
  const devices={};
  for(const b of row.breakdowns||[]){
   const device=String(b.name).toUpperCase();
   if(!['PC','MOBILE'].includes(device))continue;
   if(devices[device])throw new NaverAdsError('기기별 순위 응답이 중복됐습니다.');
   devices[device]={recentAverageRank:rank(b.recentAvgRnk),todayAverageRank:rank(b.avgRnk),impressions:b.impCnt??null};
  }
  found.set(row.id,{recentAverageRank:rank(row.recentAvgRnk),todayAverageRank:rank(row.avgRnk),devices});
 }
 return found;
}
async function recentRanks(call,ids){
 if(!ids.length)return new Map();
 return parseRecentRanks(await call('/stats',{ids:ids.join(','),fields:JSON.stringify(['impCnt','avgRnk','recentAvgRnk']),datePreset:'today',timeIncrement:'allDays',breakdown:'pcMblTp'}),ids);
}
export function sortClickKeywords(rows){return [...rows].sort((a,b)=>(b.clicks??-1)-(a.clicks??-1)||(b.impressions??-1)-(a.impressions??-1)||String(a.id).localeCompare(String(b.id)));}
export async function loadTopClickedKeywords(credentials,period,fetcher=fetch){
 if(credentials.customerId!==NAVER_CUSTOMER_ID)throw new NaverAdsError('연결 계정을 확인해주세요.',403);
 const call=naverReadClient(credentials,fetcher,{deadline:Date.now()+100000,maxCalls:230});
 const report=await loadNaverReport(credentials,period,fetcher,{call});
 const positive=report.groups.filter(g=>g.clicks>0).sort((a,b)=>b.clicks-a.clicks),groups=positive.slice(0,12),results=[];let next=0;
 async function scan(){while(next<groups.length){const g=groups[next++];const result=await loadNaverKeywords(credentials,g.id,period,fetcher,{call});results.push(...result.keywords.map(k=>({...k,groupId:g.id,groupName:g.name})));}}
 await Promise.all(Array.from({length:Math.min(3,groups.length)},scan));
 const keywords=sortClickKeywords(results.filter(k=>k.clicks>0)).slice(0,100);
 let recentError=null,recent=new Map();
 try{recent=await recentRanks(call,keywords.map(k=>k.id));}catch(e){recentError=e.publicMessage||'최근 순위를 조회하지 못했습니다.';}
 const missingGroups=report.groups.filter(g=>g.clicks==null).length;
 return {groupId:'__top__',groupName:'클릭 상위 키워드',period,keywords:keywords.map(k=>({...k,recent:recent.get(k.id)||null})),fetchedAt:new Date().toISOString(),coverage:{checkedGroups:groups.length,positiveGroups:positive.length,missingGroups,complete:positive.length<=12&&missingGroups===0},recentError};
}
export function normalizePositionBids(response,keyword,device){
 if(response?.device!==device||!Array.isArray(response?.estimate))throw new NaverAdsError('순위별 참고 입찰가 응답을 읽지 못했습니다.');
 const seen=new Set();return response.estimate.map(r=>{
  if(r.keyword!==keyword||!Number.isInteger(r.position)||r.position<1||r.position>5||seen.has(r.position))throw new NaverAdsError('순위별 참고 입찰가 응답이 요청과 일치하지 않습니다.');
  seen.add(r.position);return {position:r.position,bid:rank(r.bid)};
 }).sort((a,b)=>a.position-b.position);
}
export async function loadKeywordRankDetails(credentials,input,fetcher=fetch){
 if(credentials.customerId!==NAVER_CUSTOMER_ID||!/^nkw-[a-zA-Z0-9-]{1,100}$/.test(input.keywordId||'')||!/^grp-[a-zA-Z0-9-]{1,100}$/.test(input.groupId||''))throw new NaverAdsError('조회할 키워드를 선택해주세요.',400);
 const call=naverReadClient(credentials,fetcher),k=await call(`/ncc/keywords/${input.keywordId}`),g=await call(`/ncc/adgroups/${input.groupId}`);
 if(String(k.customerId)!==NAVER_CUSTOMER_ID||String(g.customerId)!==NAVER_CUSTOMER_ID||k.nccKeywordId!==input.keywordId||k.nccAdgroupId!==input.groupId||g.nccAdgroupId!==input.groupId||g.adgroupType!=='WEB_SITE')throw new NaverAdsError('연결 계정의 키워드만 조회할 수 있습니다.',403);
 const result={keywordId:k.nccKeywordId,groupId:g.nccAdgroupId,keyword:k.keyword,bidAmt:k.useGroupBidAmt?g.bidAmt:k.bidAmt,useGroupBidAmt:k.useGroupBidAmt,recent:null,recentError:null,estimates:[],fetchedAt:new Date().toISOString()};
 try{result.recent=(await recentRanks(call,[k.nccKeywordId])).get(k.nccKeywordId)||null;}catch(e){result.recentError=e.publicMessage||'최근 순위를 조회하지 못했습니다.';}
 for(const device of ['MOBILE','PC']){
  try{
   const path='/estimate/average-position-bid/keyword';
   const response=await fetcher(`https://api.searchad.naver.com${path}`,{method:'POST',headers:naverHeaders(credentials,path,String(Date.now()),'POST'),body:JSON.stringify({device,items:Array.from({length:5},(_,i)=>({key:k.keyword,position:i+1}))}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw new NaverAdsError(`참고 입찰가 조회 실패(HTTP ${response.status})`);
   result.estimates.push({device,positions:normalizePositionBids(await response.json(),k.keyword,device)});
  }catch{result.estimates.push({device,positions:[],error:'순위별 참고 입찰가를 제공받지 못했습니다.'});}
 }
 result.fetchedAt=new Date().toISOString();return result;
}
