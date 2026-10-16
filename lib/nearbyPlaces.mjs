export const nearbyKinds={film:'인테리어필름',materials:'인테리어 자재',food:'음식점'};
export async function findNearbyPlaces({address,kind,radius,key,fetcher=fetch}){
 if(!Object.hasOwn(nearbyKinds,kind)||![1000,3000,5000,10000].includes(radius))throw Error('검색 조건을 확인해주세요.');
 async function get(path,params){
  const url=new URL('https://dapi.kakao.com/v2/local/search/'+path+'.json');
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
  const response=await fetcher(url,{headers:{Authorization:`KakaoAK ${key}`},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error(response.status===429?'지도 검색 한도에 도달했습니다. 잠시 후 다시 시도해주세요.':'카카오 장소검색 권한 또는 서버 설정을 확인해주세요.');
  return response.json();
 }
 const geo=await get('address',{query:address});
 if(geo.documents?.length!==1||geo.meta?.total_count!==1)throw Error('현장 주소를 찾지 못했습니다. 도로명과 건물번호를 확인해주세요.');
 const {x,y}=geo.documents[0];
 if(!x||!y||!Number.isFinite(Number(x))||!Number.isFinite(Number(y))||Math.abs(Number(x))>180||Math.abs(Number(y))>90)throw Error('현장 좌표를 확인하지 못했습니다.');
 const data=await get(kind==='food'?'category':'keyword',{
  ...(kind==='food'?{category_group_code:'FD6'}:{query:nearbyKinds[kind]}),
  x,y,radius,sort:'distance',size:15,page:1
 });
 const places=(data.documents||[]).filter(p=>/^\d+$/.test(String(p.id))).map(p=>({
  id:String(p.id),name:String(p.place_name||''),address:String(p.road_address_name||p.address_name||''),
  phone:String(p.phone||''),category:String(p.category_name||''),
  distance:Number.isFinite(Number(p.distance))&&p.distance!==''?Number(p.distance):null,
  mapUrl:'https://place.map.kakao.com/'+p.id
 }));
 return {places,kind,radius,hasMore:data.meta?.is_end===false};
}
