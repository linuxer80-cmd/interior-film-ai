const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
export function classificationSql(items, drafts, companyId) {
  const ready = items.filter(item => drafts[item.id]?.profile);
  if (!ready.length) return "";
  const rows = ready.map(item => `(${quote(item.id)}::uuid, ${item.case_profile == null ? 'NULL::jsonb' : quote(JSON.stringify(item.case_profile)) + '::jsonb'}, ${quote(JSON.stringify(drafts[item.id].profile))}::jsonb)`).join(',\n');
  return `BEGIN;
SET LOCAL standard_conforming_strings = on;
CREATE TEMP TABLE classification_batch_input (id uuid PRIMARY KEY, previous jsonb, next_profile jsonb) ON COMMIT DROP;
INSERT INTO classification_batch_input VALUES\n${rows};
CREATE TEMP TABLE classification_batch_applied ON COMMIT DROP AS
WITH changed AS (
  UPDATE public.work_items AS w SET case_profile = b.next_profile
  FROM classification_batch_input AS b
  WHERE w.id = b.id AND w.company_id = ${quote(companyId)}::uuid
    AND w.case_profile IS NOT DISTINCT FROM b.previous
  RETURNING w.id
) SELECT id FROM changed;
SELECT b.id, w.sub_category,
  CASE WHEN a.id IS NOT NULL THEN '적용 완료'
       WHEN w.case_profile IS NOT DISTINCT FROM b.next_profile THEN '이미 적용됨'
       ELSE '미적용 · 변경 또는 삭제 여부 확인' END AS result,
  w.case_profile
FROM classification_batch_input b
LEFT JOIN public.work_items w ON w.id=b.id AND w.company_id=${quote(companyId)}::uuid
LEFT JOIN classification_batch_applied a ON a.id=b.id
ORDER BY b.id;
COMMIT;`;
}

export function classificationBatches(items, drafts, size = 50) {
  if (!Number.isInteger(size) || size < 1) throw new Error("Invalid batch size");
  const ready=items.filter(item=>drafts[item.id]?.profile);
  const batches=[];
  for(let i=0;i<ready.length;i+=size) batches.push(ready.slice(i,i+size));
  return batches;
}
