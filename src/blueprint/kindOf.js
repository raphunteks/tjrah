// Kelas visual badge RBAC dari label sel.
export function kindOf(v) {
  if (v === "–" || v === "-") return "none";
  if (v.startsWith("Break-glass")) return "bg";
  if (v.startsWith("CRUD")) return "crud";
  if (v.startsWith("RU")) return "ru";
  if (v.startsWith("R")) return "r";
  if (v.startsWith("Approval")) return "appr";
  return "act";
}
