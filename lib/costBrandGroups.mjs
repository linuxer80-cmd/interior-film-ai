import { normalizeFilmBrand } from "./filmBrand.mjs";
export const costBrandLabel = value => normalizeFilmBrand(value) || "미분류";
export function groupCostRows(rows, key) {
  const groups = new Map();
  for (const row of rows || []) {
    const label = key === "brand" ? costBrandLabel(row[key]) : row[key] || "미분류";
    if (!groups.has(label)) groups.set(label, {label, amount:0, rows:[]});
    const group = groups.get(label);
    group.amount += Number(row.amount || 0);
    group.rows.push(row);
  }
  return [...groups.values()].sort((a,b)=>b.amount-a.amount);
}

