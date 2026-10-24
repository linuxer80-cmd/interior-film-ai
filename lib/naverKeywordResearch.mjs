import {naverReadClient,loadNaverKeywords,NaverAdsError,NAVER_CUSTOMER_ID} from './naverAds.mjs';

export const keywordKey=value=>String(value).normalize('NFKC').replace(/\s/g,'').toLowerCase();
export function registrationReason(value){
 const v=String(value).normalize('NFKC').trim();
 return v.length>25||/[^가-힣a-zA-Z0-9 ]/.test(v)?'25자 이내 한글·영문·숫자만 등록 가능':!/(필름|시트지)/.test(v)||!/(시공|견적|리폼|업체)/.test(v)?'시공·견적·리폼·업체 검색어만 등록 가능':null;
}
export function researchHints(value){
 if(typeof value!=='string'||value.length>160)throw new NaverAdsError('검색어는 최대 5개, 각각 25자 이내로 입력해주세요.',400);
 const hints=[...new Set(value.split(/[,\n]/).map(k=>k.normalize('NFKC').replace(/\s/g,'')).filter(Boolean))];
 if(!hints.length||hints.length>5||hints.some(k=>k.length>25||/[^가-힣a-zA-Z0-9]/.test(k)))throw new NaverAdsError('검색어는 최대 5개, 각각 25자 이내로 입력해주세요.',400);
 return hints;
}
function count(value){
 if(typeof value==='string'&&/^<\s*\d+$/.test(value.trim()))return value.trim();
 return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
}
function ctr(value){const v=count(value);return typeof v==='number'&&v<=100?v:null;}
export function normalizeRelated(rows,own){
 const existing=new Map((own?.keywords||[]).map(k=>[keywordKey(k.keyword),k])),seen=new Set(),result=[];
 for(const row of rows){
  if(typeof row.relKeyword!=='string')continue;
  const keyword=row.relKeyword.normalize('NFKC').trim(),key=keywordKey(keyword);
  if(!/(필름|시트지)/.test(keyword)||seen.has(key))continue;
  seen.add(key);
  const actual=existing.get(key);
  result.push({keyword,pcSearches:count(row.monthlyPcQcCnt),mobileSearches:count(row.monthlyMobileQcCnt),pcClicks:count(row.monthlyAvePcClkCnt),mobileClicks:count(row.monthlyAveMobileClkCnt),pcCtr:ctr(row.monthlyAvePcCtr),mobileCtr:ctr(row.monthlyAveMobileCtr),competition:({high:'높음',mid:'중간',low:'낮음',높음:'높음',중간:'중간',낮음:'낮음'})[row.compIdx]||null,registered:own?!!actual:null,registrationReason:registrationReason(keyword),actual:actual?{impressions:actual.impressions,clicks:actual.clicks,ctr:actual.ctr}:null});
 }
 return result;
}
export async function researchNaverKeywords(credentials,input,period,fetcher=fetch){
 if(credentials.customerId!==NAVER_CUSTOMER_ID)throw new NaverAdsError('연결 계정을 확인해주세요.',403);
 const hints=researchHints(input.query);
 if(input.groupId&&!/^grp-[a-zA-Z0-9-]{1,100}$/.test(input.groupId))throw new NaverAdsError('비교하고 등록할 광고그룹을 선택해주세요.',400);
 const call=naverReadClient(credentials,fetcher);
 const [related,own]=await Promise.all([call('/keywordstool',{hintKeywords:hints.join(','),showDetail:'1'}),input.groupId?loadNaverKeywords(credentials,input.groupId,period,fetcher):Promise.resolve(null)]);
 if(!Array.isArray(related.keywordList)||related.keywordList.length>10000)throw new NaverAdsError('연관 키워드 응답 형식을 확인해주세요.');
 const rows=normalizeRelated(related.keywordList,own);
 return {query:hints,groupId:own?.groupId||null,groupName:own?.groupName||null,period,rows,total:rows.length,fetchedAt:new Date().toISOString()};
}
