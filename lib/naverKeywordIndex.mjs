import {naverReadClient,NaverAdsError,NAVER_CUSTOMER_ID} from './naverAds.mjs';
export const normalizeKeyword=value=>String(value).normalize('NFKC').replace(/\s/g,'').toLowerCase();
// No cache on registration: every preview and execution checks the current account.
export async function loadNaverKeywordIndex(credentials,fetcher=fetch,{request,campaigns}={}){
 if(credentials.customerId!==NAVER_CUSTOMER_ID)throw new NaverAdsError('연결 계정을 확인해주세요.',403);
 const call=request||naverReadClient(credentials,fetcher,{maxCalls:200});
 const validAccount=rows=>rows.every(r=>r&&(r.customerId==null||String(r.customerId)===NAVER_CUSTOMER_ID));
 const raw=campaigns||await call('/ncc/campaigns',{campaignType:'WEB_SITE'});
 if(!Array.isArray(raw)||raw.length>=1000||!validAccount(raw))throw new NaverAdsError('중복 확인을 위한 캠페인 목록을 완전히 조회하지 못했습니다.');
 const groups=[],groupIds=new Set(),campaignIds=new Set();
 for(const c of raw.filter(c=>c.campaignTp==='WEB_SITE'&&c.status!=='DELETED')){
  if(!c.nccCampaignId||campaignIds.has(c.nccCampaignId))throw new NaverAdsError('캠페인 목록이 중복되거나 누락됐습니다.');
  campaignIds.add(c.nccCampaignId);
  const rows=await call('/ncc/adgroups',{nccCampaignId:c.nccCampaignId,recordSize:'1000'});
  if(!Array.isArray(rows)||rows.length>=1000||!validAccount(rows))throw new NaverAdsError('광고그룹 목록을 완전히 확인하지 못했습니다.');
  for(const g of rows){
   if(g.nccCampaignId!==c.nccCampaignId||!g.nccAdgroupId||groupIds.has(g.nccAdgroupId))throw new NaverAdsError('광고그룹이 계정 목록과 일치하지 않습니다.');
   groupIds.add(g.nccAdgroupId);
   if(g.adgroupType==='WEB_SITE'&&g.status!=='DELETED')groups.push(g);
  }
 }
 if(groups.length>120)throw new NaverAdsError('광고그룹이 조회 한도를 초과해 중복 확인을 중단했습니다.');
 const byKeyword=new Map(),counts=new Map();let next=0;
 async function scan(){while(next<groups.length){
  const g=groups[next++],seen=new Set();let cursor;
  for(let page=0;page<4;page++){
   const rows=await call('/ncc/keywords',{nccAdgroupId:g.nccAdgroupId,recordSize:'1000',...(cursor?{baseSearchId:cursor,selector:'NEXT'}:{})});
   if(!Array.isArray(rows)||!validAccount(rows))throw new NaverAdsError('등록 키워드를 완전히 확인하지 못했습니다.');
   for(const k of rows){
    if(k.nccAdgroupId!==g.nccAdgroupId||!k.nccKeywordId||seen.has(k.nccKeywordId)||typeof k.keyword!=='string')throw new NaverAdsError('등록 키워드 목록이 중복되거나 누락됐습니다.');
    seen.add(k.nccKeywordId);
    if(k.status==='DELETED')continue;
    const key=normalizeKeyword(k.keyword),entries=byKeyword.get(key)||[];
    if(!entries.some(e=>e.id===g.nccAdgroupId))entries.push({id:g.nccAdgroupId,name:g.name||g.nccAdgroupId,paused:!!g.userLock||!!k.userLock});
    byKeyword.set(key,entries);
   }
   if(rows.length<1000)break;
   if(page===3)throw new NaverAdsError('등록 키워드 마지막 페이지를 확인하지 못했습니다.');
   cursor=rows.at(-1).nccKeywordId;
  }
  counts.set(g.nccAdgroupId,seen.size);
 }}
 await Promise.all(Array.from({length:Math.min(3,groups.length)},scan));
 for(const entries of byKeyword.values())entries.sort((a,b)=>a.id.localeCompare(b.id));
 return {byKeyword,counts,groupCount:groups.length,checkedAt:new Date().toISOString()};
}
