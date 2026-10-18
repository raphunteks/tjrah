// Tijarah Design System · Theme Mode Manager (Obsidian Dark / Light / System)
// Menyimpan preferensi ke localStorage dan mengontrol atribut data-theme / class .dark

export function getSavedTheme() {
  try {
    return localStorage.getItem("tijarah:theme") || "system";
  } catch {
    return "system";
  }
}

export function isSystemDark() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;

  const validTheme = ["light", "dark", "system"].includes(theme) ? theme : "system";
  const shouldBeDark = validTheme === "dark" || (validTheme === "system" && isSystemDark());

  const root = document.documentElement;
  const body = document.body;

  if (shouldBeDark) {
    root.setAttribute("data-theme", "dark");
    root.classList.add("dark");
    if (body) body.classList.add("dark");
  } else {
    root.setAttribute("data-theme", "light");
    root.classList.remove("dark");
    if (body) body.classList.remove("dark");
  }

  try {
    localStorage.setItem("tijarah:theme", validTheme);
    window.dispatchEvent(new CustomEvent("tijarah:theme_change", { detail: validTheme }));
  } catch {}
}

export function initTheme() {
  if (typeof window === "undefined") return;

  const initial = getSavedTheme();
  applyTheme(initial);

  // Pasang pemantau perubahan tema sistem OS secara otomatis
  if (window.matchMedia) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getSavedTheme() === "system") {
        applyTheme("system");
      }
    };

    if (media.addEventListener) {
      media.addEventListener("change", handler);
    } else if (media.addListener) {
      media.addListener(handler);
    }
  }
}

// Jalankan otomatis begitu modul dimuat di browser
initTheme();
