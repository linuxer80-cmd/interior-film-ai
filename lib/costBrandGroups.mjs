// Normalize display aliases for cost analysis without changing stored inventory or prices.
export function costBrandLabel(value) {
  const label = String(value ?? "").trim();
  const key = label.normalize("NFKC").toLowerCase().replace(/[\s·._-]+/g, "");
  if (["현대", "현대&c", "현대h&c", "현대l&c", "현대보닥", "현대보닷", "hyundai", "hyundail&c", "hyundaih&c", "hyundaibodaq", "bodaq"].includes(key)) return "현대보닥";
  if (["영림", "영림인테리어필름", "younglim", "youngliminteriorfilm"].includes(key)) return "영림";
  return label || "미분류";
}
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
