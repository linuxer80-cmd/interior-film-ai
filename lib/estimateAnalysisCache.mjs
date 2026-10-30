import { createHash, createHmac } from 'node:crypto';

// A batch is significant: the model compares photos together to identify
// the same object, so individual results cannot safely be mixed across batches.
const CACHE_VERSION = 'hierarchy-batch-v1';
export const ESTIMATE_ANALYSIS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function estimateAnalysisCacheKey({ companyId, sessionId, files, targetChoices, model, classifierSource, taxonomy, secret }) {
  if (!secret || !companyId || !sessionPattern.test(sessionId || '') || !Array.isArray(files) || !files.length) return null;
  const photoHashes = await Promise.all(files.map(async file => ({
    type: file.type,
    hash: createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),
  })));
  const classifierHash = createHash('sha256').update(String(classifierSource || '')).update(JSON.stringify(taxonomy || null)).digest('hex');
  return createHmac('sha256', secret).update(JSON.stringify({
    version: CACHE_VERSION, companyId, sessionId: sessionId.toLowerCase(), model, classifierHash, photoHashes, targetChoices,
  })).digest('hex');
}

export function restoreEstimateAnalysis(event, count) {
  const recorded = event?.metadata?.hierarchy_photos;
  if (!event?.id || !Array.isArray(recorded) || recorded.length !== count) return null;
  const byIndex = new Map(recorded.map(photo => [photo.index, photo]));
  if (byIndex.size !== count) return null;
  const photos = [];
  for (let index = 0; index < count; index++) {
    const targets = byIndex.get(index)?.targets;
    if (!Array.isArray(targets) || targets.length !== 1 || !targets[0]?.id || !targets[0]?.part || !targets[0]?.kind) return null;
    photos.push({index, analysis: { hierarchy_version: 1, hierarchy_targets: targets, category: targets[0].part, sub_category: targets[0].kind }});
  }
  return {success: true, analysis_id: event.id, photos, reused: true};
}

export async function findEstimateAnalysisCache({ supabase, companyId, key, count, now = Date.now() }) {
  if (!key) return null;
  const {data, error} = await supabase.from('usage_events').select('id,metadata')
    .eq('company_id', companyId).eq('event_type', 'ai_photo_analysis')
    .eq('metadata->>analysis_cache_key', key)
    .gte('created_at', new Date(now - ESTIMATE_ANALYSIS_CACHE_TTL_MS).toISOString())
    .order('created_at', {ascending: false}).limit(1).maybeSingle();
  if (error) throw error;
  return restoreEstimateAnalysis(data, count);
}

// Collapse simultaneous requests handled by the same function instance.
// The persistent cache still covers later requests across instances.
const inFlight = new Map();
const MAX_IN_FLIGHT = 128;
export async function coalesceEstimateAnalysis(key, work) {
  if (!key) return { value: await work(), shared: false };
  const existing = inFlight.get(key);
  if (existing) return { value: await existing, shared: true };
  if (inFlight.size >= MAX_IN_FLIGHT) return { value: await work(), shared: false };
  const promise = Promise.resolve().then(work);
  inFlight.set(key, promise);
  try { return { value: await promise, shared: false }; }
  finally { if (inFlight.get(key) === promise) inFlight.delete(key); }
}
