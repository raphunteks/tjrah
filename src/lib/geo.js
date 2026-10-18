/**
 * TIJARAH GEOLOCATION & REVERSE GEOCODING ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Menangani perizinan lokasi GPS real-time browser saat membuka dashboard,
 * caching koordinat perangkat owner/merchant, dan reverse geocoding akurat (OSM/Nominatim)
 * untuk auto-populate alamat jalan & kota pada "Tambah Cabang Baru" & "Kelola Cabang".
 */

const STORAGE_KEY_GEO = "tijarah:device_geo";
const STORAGE_KEY_ADDR = "tijarah:device_addr";

/** Memory cache singleton */
let memoryGeo = null;
let activeGeoPromise = null;

/**
 * Mengambil data lokasi tersimpan secara sinkron dari memori atau sessionStorage.
 * @returns {{ lat: number, lng: number, road?: string, city?: string, address?: string } | null}
 */
export function getDeviceLocationSync() {
  if (memoryGeo) return memoryGeo;
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_GEO);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lat === "number" && typeof parsed.lng === "number") {
        memoryGeo = parsed;
        return parsed;
      }
    }
  } catch {}
  return null;
}

/**
 * Reverse Geocode koordinat Lat/Lng menjadi nama jalan & kota yang akurat.
 * Menggunakan OpenStreetMap Nominatim dengan fallback terstruktur.
 */
export async function reverseGeocode(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (isNaN(nLat) || isNaN(nLng)) return null;

  // 1. Coba OpenStreetMap / Nominatim terlebih dahulu (akurat, bebas quota & billing)
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${nLat}&lon=${nLng}&zoom=18&addressdetails=1`,
      {
        headers: {
          "Accept-Language": "id, en",
          "User-Agent": "Tijarah-App/1.0",
        },
      }
    );

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.address) {
        const a = data.address;
        const road = a.road || a.pedestrian || a.residential || a.suburb || a.street || "";
        const neighbourhood = a.neighbourhood || a.suburb || a.village || "";
        const city = a.city || a.town || a.city_district || a.county || "Makassar";
        const full = [road, neighbourhood, city].filter(Boolean).join(", ") || data.display_name;

        return {
          road: road || full,
          city: city || "Makassar",
          address: full,
          displayName: data.display_name,
        };
      }
    }
  } catch {}

  // 2. Coba Google Geocoder resmi jika Google Maps SDK sudah dimuat dan billing tidak error
  if (typeof window !== "undefined" && window.google?.maps?.Geocoder && !window.__gcpBillingDisabled) {
    try {
      const gResult = await new Promise((resolve) => {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat: nLat, lng: nLng } }, (results, status) => {
          if (status === "OK" && results && results[0]) {
            resolve(results[0]);
          } else {
            resolve(null);
          }
        });
      });

      if (gResult) {
        let road = "";
        let city = "Makassar";
        for (const c of gResult.address_components || []) {
          if (c.types.includes("route")) road = c.long_name;
          if (c.types.includes("administrative_area_level_2") || c.types.includes("locality")) {
            city = c.long_name.replace(/^(Kota|Kabupaten)\s+/i, "");
          }
        }
        return {
          road: road || gResult.formatted_address,
          city: city || "Makassar",
          address: gResult.formatted_address,
          displayName: gResult.formatted_address,
        };
      }
    } catch {
      window.__gcpBillingDisabled = true;
    }
  }
    // Fallback: jika Nominatim gagal/rate-limited, coba Photon Komoot
    try {
      const pResp = await fetch(
        `https://photon.komoot.io/reverse?lat=${nLat}&lon=${nLng}`
      );
      if (pResp.ok) {
        const pData = await pResp.json();
        const f = pData?.features?.[0]?.properties;
        if (f) {
          const road = f.name || f.street || "";
          const city = f.city || f.district || "Makassar";
          const full = [road, f.district, city].filter(Boolean).join(", ");
          return {
            road: road || full,
            city,
            address: full,
            displayName: full,
          };
        }
      }
    } catch {}

  return null;
}

/**
 * Meminta izin lokasi GPS perangkat ke user jika belum ada, lalu mengambil koordinat real-time.
 * Dipanggil otomatis saat dashboard pertama kali dibuka (AppShell).
 *
 * @param {boolean} [force=false] Jika true, memaksa pengambilan posisi baru walau sudah ada cache
 * @returns {Promise<{ lat: number, lng: number, road: string, city: string, address: string } | null>}
 */
export async function requestDeviceLocation(force = false) {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    return null;
  }

  // Jika sudah ada cache valid & tidak force, kembalikan langsung
  if (!force) {
    const existing = getDeviceLocationSync();
    if (existing && existing.lat && existing.lng) {
      return existing;
    }
  }

  // Cegah multiple concurrent native browser prompts
  if (activeGeoPromise) return activeGeoPromise;

  activeGeoPromise = new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracy = pos.coords.accuracy;

        const baseResult = {
          lat,
          lng,
          accuracy,
          road: "",
          city: "Makassar",
          address: "",
          timestamp: Date.now(),
        };

        memoryGeo = baseResult;
        try {
          sessionStorage.setItem(STORAGE_KEY_GEO, JSON.stringify(baseResult));
        } catch {}

        // Broadcast event bahwa koordinat real-time didapatkan
        if (typeof window !== "undefined") {
          window.__TIJARAH_DEVICE_GEO__ = baseResult;
          window.dispatchEvent(new CustomEvent("tijarah:geo_detected", { detail: baseResult }));
        }

        // Lakukan reverse geocode otomatis untuk mendeteksi nama jalan
        try {
          const geoAddr = await reverseGeocode(lat, lng);
          if (geoAddr) {
            baseResult.road = geoAddr.road || "";
            baseResult.city = geoAddr.city || "Makassar";
            baseResult.address = geoAddr.address || "";
            baseResult.displayName = geoAddr.displayName || "";

            memoryGeo = baseResult;
            try {
              sessionStorage.setItem(STORAGE_KEY_GEO, JSON.stringify(baseResult));
            } catch {}

            if (typeof window !== "undefined") {
              window.__TIJARAH_DEVICE_GEO__ = baseResult;
              window.dispatchEvent(new CustomEvent("tijarah:geo_detected", { detail: baseResult }));
            }
          }
        } catch {}

        activeGeoPromise = null;
        resolve(baseResult);
      },
      (err) => {
        activeGeoPromise = null;
        // User menolak izin / timeout -> resolve null (graceful)
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });

  return activeGeoPromise;
}
