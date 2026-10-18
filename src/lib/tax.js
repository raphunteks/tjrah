// Pajak penjualan per tenant (Fase 0). Sama dengan pay_order() di SQL:
// tagihan klinik (channel "clinic") selalu tanpa pajak; selain itu tenant.tax_rate.
export const taxRateOf = (tenant) => Number(tenant?.tax_rate ?? 0);
export const taxOf = (order, tenant) => (order?.channel === "clinic" ? 0 : Math.round((order?.subtotal ?? 0) * taxRateOf(tenant)));
export const pctLabel = (r) => `${(Number(r) * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
/** Label untuk baris pajak, mis. "PBJT 10%" atau "Tanpa pajak". */
export function taxLabel(order, tenant) {
  if (order?.channel === "clinic") return "Pajak · tidak berlaku (jasa kesehatan)";
  const r = taxRateOf(tenant);
  if (!r) return tenant?.tax_label && tenant.tax_label !== "Pajak" ? tenant.tax_label : "Tanpa pajak";
  return `${tenant?.tax_label ?? "Pajak"} ${pctLabel(r)}`;
}
