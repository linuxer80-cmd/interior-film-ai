import { createHash } from "node:crypto";
const entries = new Map();
const TTL = 10 * 60 * 1000;
const MAX = 128;
export async function cachedEmbedding({ companyId, model, text, load, now = Date.now }) {
  const key = createHash("sha256").update(JSON.stringify([companyId, model, text])).digest("hex");
  const hit = entries.get(key);
  if (hit && hit.expires > now()) return [...await hit.promise];
  if (hit) entries.delete(key);
  while (entries.size >= MAX) entries.delete(entries.keys().next().value);
  const entry = { expires: now() + TTL };
  entry.promise = Promise.resolve().then(load).then(value => {
    if (!Array.isArray(value) || !value.length || !value.every(Number.isFinite)) throw new Error("Invalid embedding");
    return [...value];
  });
  entries.set(key, entry);
  try { return [...await entry.promise]; }
  catch (error) { if (entries.get(key) === entry) entries.delete(key); throw error; }
}
