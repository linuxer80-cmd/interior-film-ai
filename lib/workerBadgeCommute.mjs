import { randomUUID } from 'node:crypto';

// Called only with the server database and an authenticated actor.
export async function syncBadgeCommute(db, actor, {
 key=process.env.KAKAO_REST_API_KEY, fetcher=fetch
}={}) {
 const claim=await db.rpc('claim_badge_commute',{p_actor:actor});
 if(claim.error) throw Error('출근 거리 배지 SQL을 먼저 적용해주세요.');
 const trip=claim.data;
 if(!trip)return {processed:0,message:'계산할 기록이 없거나 출근 확인·재시도 대기 중입니다.'};
 const update=values=>db.from('worker_badge_commutes').update(values).eq('id',trip.id).eq('user_id',actor).eq('claim_token',trip.claim_token);
 try {
  const cached=await db.from('worker_badge_commutes').select('one_way_m')
   .eq('user_id',actor).eq('origin_address',trip.origin_address)
   .eq('destination_address',trip.destination_address).not('one_way_m','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(cached.error)throw Error('저장된 거리를 확인하지 못했습니다.');
  let metres=cached.data?.one_way_m;
  if(metres==null) {
   if(!key)throw Error('지도 서버 설정이 필요합니다.');
   const quota=await db.rpc('reserve_commute_quota',{p_company_id:trip.company_id,p_request_id:randomUUID()});
   if(quota.error||!quota.data?.ok)throw Error('지도 조회 한도를 확인해주세요. 거리는 다음에 다시 계산할 수 있습니다.');
   async function kakao(url) {
    const response=await fetcher(url,{headers:{Authorization:`KakaoAK ${key}`},cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('지도 조회에 실패했습니다. 잠시 후 다시 계산해주세요.');
    return response.json();
   }
   async function geocode(address) {
    const url=new URL('https://dapi.kakao.com/v2/local/search/address.json');url.searchParams.set('query',address);
    const result=await kakao(url);
    if(result.meta?.total_count!==1||result.documents?.length!==1)throw Error('출근 당시 출발지 또는 현장 주소가 불명확하여 거리를 계산하지 못했습니다.');
    const {x,y}=result.documents[0];const lon=Number(x),lat=Number(y);
    if(!x||!y||!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)throw Error('주소 좌표를 확인하지 못했습니다.');
    return `${lon},${lat}`;
   }
   const [origin,destination]=await Promise.all([geocode(trip.origin_address),geocode(trip.destination_address)]);
   if(origin===destination)metres=0;
   else {
    const url=new URL('https://apis-navi.kakaomobility.com/v1/directions');
    for(const [k,v] of Object.entries({origin,destination,summary:'true',priority:'RECOMMEND',alternatives:'false'}))url.searchParams.set(k,v);
    const data=await kakao(url);
    metres=data.routes?.find(r=>r.result_code===0)?.summary?.distance;
   }
  }
  if(!Number.isInteger(metres)||metres<0||metres>1500000)throw Error('유효한 도로거리를 확인하지 못했습니다.');
  const saved=await update({one_way_m:metres,claim_token:null}).select('id').maybeSingle();
  if(saved.error||!saved.data)throw Error('거리 저장에 실패했습니다.');
  return {processed:1,message:'출근 거리 1건을 계산했습니다. 남은 기록은 다시 계산할 수 있습니다.'};
 } catch(error) {
  await update({lease_until:new Date(Date.now()+30*60*1000).toISOString(),claim_token:null});
  throw error;
 }
}

