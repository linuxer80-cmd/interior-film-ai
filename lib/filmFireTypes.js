// Called only after a successful, authorized site RPC.
export async function withFilmFireTypes(db, siteId, value) {
  if (!siteId || !value || typeof value !== "object") return value;
  const { data: site, error: siteError } = await db.from("sites")
    .select("company_id").eq("id", siteId).single();
  if (siteError) throw siteError;
  if (!site?.company_id) throw new Error("현장 업체를 확인할 수 없습니다.");
  const read = async (table, fields, key, ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    const rows = [];
    for (let i = 0; i < unique.length; i += 100) {
      const { data, error } = await db.from(table).select(fields)
        .eq("company_id", site.company_id).in(key, unique.slice(i, i + 100));
      if (error) throw error;
      rows.push(...(data || []));
    }
    return rows;
  };
  const materials = [...(value.materials || []), ...(value.snapshot?.materials || [])];
  const materialRows = await read("site_materials", "*", "id", materials.map(m => m.id));
  const purchases = await read("film_roll_purchases", "roll_id,price_type", "roll_id", [
    ...(value.rolls || []).map(r => r.id), ...(value.trips || []).map(t => t.roll_id),
  ]);
  const normalized = type => ["fire", "non_fire"].includes(type) ? type : "unspecified";
  const byMaterial = new Map(materialRows.filter(m => m.site_id === siteId).map(m => [m.id, normalized(m.price_type)]));
  const byRoll = new Map(purchases.map(p => [p.roll_id, normalized(p.price_type)]));
  const removed = new Set(materialRows.filter(m => m.site_id === siteId && m.removed_at).map(m => m.id));
  const enrichMaterial = m => ({ ...m, price_type: byMaterial.get(m.id) || "unspecified" });
  return {
    ...value,
    ...(Array.isArray(value.materials) ? { materials: value.materials.filter(m => !removed.has(m.id)).map(enrichMaterial) } : {}),
    ...(Array.isArray(value.rolls) ? { rolls: value.rolls.map(r => ({ ...r, price_type: byRoll.get(r.id) || "unspecified" })) } : {}),
    ...(Array.isArray(value.trips) ? { trips: value.trips.map(t => ({ ...t, price_type: byRoll.get(t.roll_id) || "unspecified" })) } : {}),
    ...(value.snapshot ? { snapshot: { ...value.snapshot, materials: (value.snapshot.materials || []).filter(m => !removed.has(m.id)).map(enrichMaterial) } } : {}),
  };
}
