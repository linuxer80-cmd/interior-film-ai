// Historical material amounts do not record whether VAT was included.
// This is a comparison estimate, never a rewrite of booked costs or profit.
export function materialVatEstimate(amount) {
  if (amount == null || amount === '') return null;
  const base = Number(amount);
  if (!Number.isFinite(base) || base < 0) return null;
  const tax = Math.round(base * 0.1);
  return { base, tax, total: base + tax };
}

// Profit already deducts the recorded material amount. Deduct only the
// estimated VAT here so that the cost itself is never counted twice.
export function profitAfterMaterialVat(profit, material) {
  const vat = materialVatEstimate(material);
  const baseProfit = Number(profit);
  if (profit == null || profit === '' || !Number.isFinite(baseProfit) || !vat) return null;
  return baseProfit - vat.tax;
}
