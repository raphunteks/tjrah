// ID perangkat anonim untuk membatasi permintaan Kode Masuk per perangkat. Tanpa localStorage.
let mem = null;
export function deviceId() {
  try {
    let v = sessionStorage.getItem("tijarah-device") ?? sessionStorage.getItem("harumin-device");
    if (!v) { v = (crypto.randomUUID?.() ?? `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`); sessionStorage.setItem("tijarah-device", v); }
    return v;
  } catch {
    return (mem ??= `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  }
}
