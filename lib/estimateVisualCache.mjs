import { createHmac } from 'node:crypto';
import sharp from 'sharp';
import { restoreEstimateAnalysis } from './estimateAnalysisCache.mjs';

export const VISUAL_CACHE_TTL_MS = 10 * 60 * 1000;
export function visualCacheScope({companyId, sessionId, targetChoices, classifier, secret}) {
  if (!secret || !companyId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sessionId)) return null;
  return createHmac('sha256', secret).update(JSON.stringify(['visual-v1', companyId, sessionId.toLowerCase(), targetChoices, classifier])).digest('hex');
}
export async function photoSignature(file) {
  const input = Buffer.from(await file.arrayBuffer());
  const pipeline = sharp(input, {limitInputPixels: 24_000_000}).rotate().removeAlpha();
  const {data, info} = await pipeline.clone().resize(32, 32, {fit:'fill'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const metadata = await sharp(input).metadata();
  const rotated = [5,6,7,8].includes(metadata.orientation);
  const ratio = rotated ? metadata.height / metadata.width : metadata.width / metadata.height;
  const color = await pipeline.clone().resize(8,8,{fit:'fill'}).toColourspace('srgb').raw().toBuffer();
  if (info.channels !== 1) throw Error('Unsupported signature');
  return {ratio, gray:Array.from(data), color:Array.from(color)};
}
export function sameRecentView(a,b) {
  if (!a || !b || !Number.isFinite(a.ratio) || !Number.isFinite(b.ratio) || Math.abs(a.ratio-b.ratio)>0.01 ||
      a.gray?.length!==1024 || b.gray?.length!==1024 || a.color?.length!==192 || b.color?.length!==192) return false;
  if ([...a.gray,...b.gray,...a.color,...b.color].some(v=>!Number.isFinite(v)||v<0||v>255)) return false;
  const mean = values => values.reduce((s,v)=>s+v,0)/values.length;
  const ma=mean(a.gray), mb=mean(b.gray);
  const contrast = (values,m) => Math.sqrt(mean(values.map(v=>(v-m)**2)));
  // Flat doors / walls cannot identify a physical object reliably.
  if (contrast(a.gray,ma)<25 || contrast(b.gray,mb)<25 || Math.abs(ma-mb)>8) return false;
  let error=0, edgeError=0, edges=0;
  for(let i=0;i<1024;i++) {
    error+=Math.abs((a.gray[i]-ma)-(b.gray[i]-mb));
    if(i%32<31) {
      const ga=a.gray[i+1]-a.gray[i], gb=b.gray[i+1]-b.gray[i];
      if(Math.abs(ga)>15 || Math.abs(gb)>15){edges++;edgeError+=Math.abs(ga-gb);}
    }
  }
  const colorError=mean(a.color.map((v,i)=>Math.abs(v-b.color[i])));
  return edges>=60 && error/1024<=3 && edgeError/edges<=4 && colorError<=5;
}
export async function findVisualAnalysisCache({supabase,companyId,scope,signatures,now=Date.now()}) {
  if(!scope || !signatures?.length) return null;
  const {data,error}=await supabase.from('usage_events').select('id,metadata')
    .eq('company_id',companyId).eq('event_type','ai_photo_analysis').eq('metadata->>visual_cache_scope',scope)
    .gte('created_at',new Date(now-VISUAL_CACHE_TTL_MS).toISOString()).order('created_at',{ascending:false}).limit(5);
  if(error)throw error;
  for(const event of data||[]) {
    const previous=event.metadata?.visual_signatures;
    if(previous?.length!==signatures.length || !signatures.every((s,i)=>sameRecentView(s,previous[i])))continue;
    const result=restoreEstimateAnalysis(event,signatures.length);
    if(result && result.photos.every(p=>p.analysis.hierarchy_targets.every(t=>t.kind!=='확인 필요'&&t.space!=='확인 필요'&&t.object_confidence==='high')))return {...result,reuse_reason:'recent_view'};
  }
  return null;
}
