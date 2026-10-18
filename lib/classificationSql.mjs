const quote = value => "E'" + String(value).replaceAll("\\", "\\\\").replaceAll("'", "''") + "'";
export function classificationSql(items, drafts, companyId) {
  const ready = items.filter(item => drafts[item.id]?.profile);
  if (!ready.length) return "";
  const rows = ready.map(item => `(${quote(item.id)}::uuid, ${item.case_profile == null ? 'NULL::jsonb' : quote(JSON.stringify(item.case_profile)) + '::jsonb'}, ${quote(JSON.stringify(drafts[item.id].profile))}::jsonb)`).join(',\n');
  return `WITH classification_batch_input (id, previous, next_profile) AS (
  VALUES
${rows}
), classification_batch_applied AS (
  UPDATE public.work_items AS w SET case_profile = b.next_profile
  FROM classification_batch_input AS b
  WHERE w.id = b.id AND w.company_id = ${quote(companyId)}::uuid
    AND w.case_profile IS NOT DISTINCT FROM b.previous
  RETURNING w.id, w.sub_category, w.case_profile
)
SELECT b.id, COALESCE(a.sub_category,w.sub_category) AS sub_category,
  CASE WHEN a.id IS NOT NULL THEN '적용 완료'
       WHEN w.id IS NOT NULL AND w.case_profile IS NOT DISTINCT FROM b.next_profile THEN '이미 적용됨'
       ELSE '미적용 · 변경 또는 삭제 여부 확인' END AS result,
  CASE WHEN a.id IS NOT NULL THEN a.case_profile ELSE w.case_profile END AS case_profile
FROM classification_batch_input b
LEFT JOIN public.work_items w ON w.id=b.id AND w.company_id=${quote(companyId)}::uuid
LEFT JOIN classification_batch_applied a ON a.id=b.id
ORDER BY b.id;`;

}

export function classificationBatches(items, drafts, size = 30) {
  if (!Number.isInteger(size) || size < 1) throw new Error("Invalid batch size");
  const ready=items.filter(item=>drafts[item.id]?.profile);
  const batches=[];
  for(let i=0;i<ready.length;i+=size) batches.push(ready.slice(i,i+size));
  return batches;
}
