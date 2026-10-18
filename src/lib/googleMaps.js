/**
 * TIJARAH GOOGLE MAPS JS API LOADER
 * ─────────────────────────────────────────────────────────────────────────────
 * Memuat SDK resmi Google Maps JavaScript API + Places Library secara aman,
 * singleton (hanya dimuat sekali), menggunakan metode resmi Google Script Loader
 * dengan callback async dan proteksi penuh terhadap error/unmount.
 */

let loaderPromise = null;

export function getGoogleMapsApiKey() {
  return (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
}

/**
 * Memuat Google Maps JS API dengan library places.
 * @returns {Promise<typeof google>}
 */
export function loadGoogleMaps() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window not defined"));
  }

  // Jika Google Maps sudah siap di window, langsung resolve
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (loaderPromise) return loaderPromise;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY belum dikonfigurasi di .env.local"));
  }

  // Cek apakah script tag sudah ada di DOM
  const existingScript = document.getElementById("google-maps-js-sdk");
  if (existingScript) {
    loaderPromise = new Promise((resolve, reject) => {
      if (window.google?.maps?.places) {
        resolve(window.google);
        return;
      }
      existingScript.addEventListener("load", () => {
        if (window.google?.maps?.places) {
          resolve(window.google);
        } else {
          // Tunggu sedikit jika window.google sedang inisialisasi modul
          setTimeout(() => resolve(window.google), 100);
        }
      });
      existingScript.addEventListener("error", (e) => {
        loaderPromise = null;
        reject(new Error("Gagal mengunduh script Google Maps"));
      });
    });
    return loaderPromise;
  }

  // Buat script tag baru dengan callback resmi Google async
  loaderPromise = new Promise((resolve, reject) => {
    const callbackName = `__initGoogleMaps_${Math.random().toString(36).slice(2, 9)}`;

    window[callbackName] = () => {
      try {
        delete window[callbackName];
      } catch {}
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        setTimeout(() => resolve(window.google), 100);
      }
    };

    const script = document.createElement("script");
    script.id = "google-maps-js-sdk";
    script.type = "text/javascript";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,marker&language=id&region=ID&callback=${callbackName}&loading=async`;
    script.async = true;
    script.defer = true;

    script.onerror = (err) => {
      try {
        delete window[callbackName];
      } catch {}
      loaderPromise = null;
      console.warn("[GoogleMapsLoader] Network error saat memuat Google Maps script");
      reject(new Error("Network error saat memuat Google Maps script"));
    };

    document.head.appendChild(script);
  });

  return loaderPromise;
}

/**
 * Reverse geocode koordinat lat & lng menjadi alamat lengkap di Indonesia.
 * Berurutan: OpenStreetMap Nominatim (Bebas Quota & Bebas Console Error) -> Google Maps JS API -> Fallback koordinat.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string>}
 */
export async function reverseGeocode(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return "";

  // 1. Coba OpenStreetMap Nominatim terlebih dahulu (Akurat nama jalan/kota Indonesia, bebas billing GCP & bebas console error)
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`, {
      headers: { "User-Agent": "TijarahPOS/1.0" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.display_name) {
        return data.display_name;
      }
    }
  } catch {
    /* lanjutkan ke fallback */
  }

  // 2. Coba Google Maps JS API Geocoder hanya jika window.__gcpBillingDisabled belum diset
  if (typeof window !== "undefined" && !window.__gcpBillingDisabled) {
    try {
      const google = await loadGoogleMaps();
      if (google?.maps?.Geocoder) {
        const geocoder = new google.maps.Geocoder();
        const res = await geocoder.geocode({ location: { lat, lng } });
        if (res.results && res.results[0]?.formatted_address) {
          return res.results[0].formatted_address;
        }
      }
    } catch {
      if (typeof window !== "undefined") window.__gcpBillingDisabled = true;
    }
  }

  // 3. Coba Google Geocoding REST API bila ada kunci API
  const apiKey = getGoogleMapsApiKey();
  if (apiKey && typeof window !== "undefined" && !window.__gcpBillingDisabled) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=id`);
      const data = await res.json();
      if (data.results && data.results[0]?.formatted_address) {
        return data.results[0].formatted_address;
      }
    } catch {
      /* lanjutkan ke fallback koordinat */
    }
  }

  return `Titik GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}


