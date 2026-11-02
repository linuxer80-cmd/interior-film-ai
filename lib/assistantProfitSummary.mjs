import { profitState } from "./settlementFlow.mjs";
import { materialVatEstimate, profitAfterMaterialVat } from "./materialVatEstimate.mjs";

// Keep the same pending-site and VAT rules as the existing profit screen.
export function assistantProfitSummary(source, excludedWorkerIds = []) {
  if (!source || !Array.isArray(source.sites) || !Array.isArray(source.breakdown?.labor)) throw new Error("수익 정보를 확인할 수 없습니다.");
  const excluded = new Set(excludedWorkerIds);
  const result = { revenue: 0, labor: 0, material: 0, expense: 0, profit: 0, confirmedCount: 0, pendingCount: 0 };
  for (const site of source.sites) {
    if (profitState(site).pending) { result.pendingCount++; continue; }
    const laborExcluded = source.breakdown.labor.filter(row => row.siteId === site.id && excluded.has(row.workerId)).reduce((sum,row) => sum + (Number(row.amount) || 0), 0);
    const rawValues = [site.revenue, site.labor, site.material, site.expense, site.profit];
    if (rawValues.some(value => value == null || value === '' || typeof value === 'boolean')) throw new Error("수익 금액을 확인할 수 없습니다.");
    const values = rawValues.map(Number);
    if (values.some(value => !Number.isFinite(value))) throw new Error("수익 금액을 확인할 수 없습니다.");
    const [revenue,labor,material,expense,profit] = values;
    const vat = materialVatEstimate(material);
    const adjustedProfit = profitAfterMaterialVat(profit + laborExcluded, material);
    if (!vat || adjustedProfit == null) throw new Error("자재비를 확인할 수 없습니다.");
    result.revenue += revenue; result.labor += labor - laborExcluded; result.material += vat.total;
    result.expense += expense; result.profit += adjustedProfit; result.confirmedCount++;
  }
  return result;
}
