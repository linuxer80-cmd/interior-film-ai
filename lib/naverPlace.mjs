// Official NAVER API HUB local search only. This is not a Smartplace management API.
export const PLACE_ID='1035554754';
export const PLACE_QUERY='기분좋은공간 인천';
export const PLACE_URL=`https://m.place.naver.com/place/${PLACE_ID}/home`;
export const PLACE_API_DOC='https://api.ncloud-docs.com/docs/naver-api-hub-search-local';
const problem=(message,status=400)=>Object.assign(Error(message),{status,publicMessage:message});
export function placeCredentials(body){
  const clientId=String(body.clientId||'').trim(),clientSecret=String(body.clientSecret||'').trim();
  if(!/^[A-Za-z0-9_-]{4,256}$/.test(clientId)||!/^\S{8,4096}$/.test(clientSecret)||/[^\x21-\x7e]/.test(clientSecret))throw problem('NAVER API HUB의 Client ID와 Client Secret을 확인해주세요. 검색광고 키와 다릅니다.');
  return {clientId,clientSecret};
}
const clean=value=>typeof value==='string'?value.replace(/<[^>]*>/g,'').slice(0,2000):'';
function safeLink(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
export async function loadPlaceSearch(credentials,{fetchImpl=fetch,now=new Date()}={}){
  const creds=placeCredentials(credentials),url=new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');
  url.search=new URLSearchParams({query:PLACE_QUERY,display:'5',start:'1',sort:'random',format:'json'}).toString();
  let response;
  try{response=await fetchImpl(url,{method:'GET',headers:{'X-NCP-APIGW-API-KEY-ID':creds.clientId,'X-NCP-APIGW-API-KEY':creds.clientSecret},signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});}
  catch{throw problem('지역 검색 API에 연결하지 못했습니다. 잠시 후 다시 조회해주세요.',502);}
  if(!response.ok)throw problem(response.status===401||response.status===403?'지역 검색 API 인증을 확인해주세요. NAVER API HUB의 검색 API 이용 설정과 키를 확인해주세요.':response.status===429?'지역 검색 API 호출 한도에 도달했습니다. 이후 다시 조회해주세요.':'지역 검색 API 조회를 완료하지 못했습니다.',response.status===429?429:502);
  let data;try{data=await response.json();}catch{throw problem('지역 검색 API 응답을 확인하지 못했습니다.',502);}
  if(!Array.isArray(data?.items)||data.items.length>5||!Number.isInteger(data.total)||data.total<0)throw problem('지역 검색 API 응답 형식이 올바르지 않습니다.',502);
  const items=data.items.map(item=>({title:clean(item.title),category:clean(item.category),description:clean(item.description),address:clean(item.address),roadAddress:clean(item.roadAddress),link:safeLink(item.link)}));
  return {query:PLACE_QUERY,source:'NAVER API HUB 지역 검색',queriedAt:now.toISOString(),sourceBuiltAt:clean(data.lastBuildDate)||null,items,total:data.total,placeId:PLACE_ID};
}
