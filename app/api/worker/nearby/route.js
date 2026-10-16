import {GET as mySitesGET} from '../my-sites/route';
import {privateJson as json,uuid} from '../../../../lib/workerPrivate';
import {findNearbyPlaces,nearbyKinds} from '../../../../lib/nearbyPlaces.mjs';
import {createHash} from 'node:crypto';

export const runtime='nodejs';
export const maxDuration=30;
// Short-lived bounded cache; authorization is checked even on cache hits.
const cache=new Map();
const pending=new Map();
export async function GET(request){
 try{
  const params=new URL(request.url).searchParams;
  const siteId=params.get('siteId'),kind=params.get('kind')||'film';
  const radius=Number(params.get('radius')||3000);
  if(!uuid(siteId)||!Object.hasOwn(nearbyKinds,kind)||![1000,3000,5000,10000].includes(radius))return json({error:'검색 조건을 확인해주세요.'},400);
  const url=new URL(request.url);url.pathname='/api/worker/my-sites';url.search='';url.searchParams.set('siteId',siteId);
  const access=await mySitesGET(new Request(url,{headers:request.headers}));
  const allowed=await access.json();
  if(!access.ok)return json({error:allowed.error||'현장 접근 권한을 확인해주세요.'},access.status);
  const site=allowed.site;
  if(!site||site.site_id!==siteId)return json({error:'배정된 현장만 검색할 수 있습니다.'},403);
  const address=String(site.address||'').trim();
  if(!address)return json({error:'현장 주소를 먼저 등록해주세요.'},400);
  const key=process.env.KAKAO_REST_API_KEY;
  if(!key)return json({error:'카카오 지도 검색 설정이 필요합니다.'},503);
  const id=createHash('sha256').update(JSON.stringify([siteId,address,kind,radius])).digest('hex');
  const saved=cache.get(id);
  if(saved&&saved.expires>Date.now())return json({...saved.result,cached:true});
  if(!pending.has(id)){
   if(pending.size>=30)return json({error:'지도 검색이 몰리고 있습니다. 잠시 후 다시 시도해주세요.'},429);
   const task=findNearbyPlaces({address,kind,radius,key}).then(result=>{
    if(cache.size>=200)cache.delete(cache.keys().next().value);
    cache.set(id,{result,expires:Date.now()+600000});return result;
   }).finally(()=>pending.delete(id));
   pending.set(id,task);
  }
  return json(await pending.get(id));
 }catch(error){
  return json({error:error.name==='TimeoutError'?'지도 검색이 지연됩니다. 다시 시도해주세요.':error.message||'주변 장소를 찾지 못했습니다.'},502);
 }
}
