const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("id-ID");
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export const rupiah = (n) => (n == null ? "—" : idr.format(n));
export const rupiahShort = (n) => (n == null ? "—" : `Rp ${compact.format(n)}`);
export const number = (n) => (n == null ? "—" : num.format(n));
export const pct = (n) => (n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(1).replace(".", ",")}%`);
export const date = (d) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
export const dateTime = (d) =>
  new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const getAppTimezone = () => {
  try {
    return localStorage.getItem("tijarah:timezone") || "Asia/Makassar";
  } catch {
    return "Asia/Makassar";
  }
};

export const getTimezoneAbbr = (tz = getAppTimezone()) => {
  if (tz === "Asia/Jakarta") return "WIB";
  if (tz === "Asia/Jayapura") return "WIT";
  return "WITA";
};

