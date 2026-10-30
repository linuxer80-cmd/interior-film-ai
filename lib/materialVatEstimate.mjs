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

// Divide each site's rounded VAT across its detail rows without losing won.
// Brand and supplier breakdowns can then add up to the same site-based total.
export function allocateMaterialVatRows(rows) {
  const result = (rows || []).map(row => ({ ...row, vatEstimate: 0 }));
  const sites = new Map();
  result.forEach((row, index) => {
    const amount = Number(row.amount || 0);
    if (!Number.isFinite(amount) || amount < 0) return;
    const key = row.siteId ?? `missing:${index}`;
    if (!sites.has(key)) sites.set(key, []);
    sites.get(key).push({ index, amount });
  });
  for (const entries of sites.values()) {
    const amount = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const vat = materialVatEstimate(amount);
    if (!vat || !amount) continue;
    let assigned = 0;
    const shares = entries.map(entry => {
      const exact = vat.tax * entry.amount / amount;
      const whole = Math.floor(exact);
      result[entry.index].vatEstimate = whole;
      assigned += whole;
      return { index: entry.index, fraction: exact - whole };
    });
    shares.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; i < vat.tax - assigned; i++) result[shares[i].index].vatEstimate++;
  }
  return result;
}
