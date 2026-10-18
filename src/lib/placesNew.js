/**
 * TIJARAH PLACES API (NEW) ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Menghubungkan pencarian alamat dengan Google Places API (New) resmi:
 * https://developers.google.com/maps/documentation/places/web-service/op-overview?hl=id
 * https://developers.google.com/maps/documentation/places/web-service/legacy/migrate-overview?hl=id
 *
 * Menggantikan legacy Google Places Autocomplete untuk menghindari error:
 * "You're calling a legacy API, which is not enabled for your project."
 */

import { getGoogleMapsApiKey } from "./googleMaps.js";

/**
 * Mengambil saran autocomplete pencarian alamat dari Google Places API (New).
 *
 * @param {string} input - Teks pencarian (contoh: "andi tonro no 30 f")
 * @param {{ lat?: number, lng?: number }} [biasCoords] - Koordinat bias wilayah sekitar
 * @param {string} [sessionToken] - Token sesi pencarian untuk optimasi billing Google Cloud
 * @returns {Promise<Array<{ id: string, placeId: string, mainText: string, secondaryText: string, fullText: string }>>}
 */
export async function fetchPlacesNewSuggestions(input, biasCoords = null, sessionToken = null) {
  const query = String(input || "").trim();
  if (!query || query.length < 2) return [];

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return [];

  try {
    const payload = {
      input: query,
      includedRegionCodes: ["id"], // Prioritas seluruh wilayah Indonesia
      languageCode: "id", // Format alamat dan wilayah dalam Bahasa Indonesia
    };

    if (sessionToken) {
      payload.sessionToken = sessionToken;
    }

    // Tambahkan locationBias radius 50km jika ada koordinat acuan (misal posisi user/cabang)
    if (biasCoords && typeof biasCoords.lat === "number" && typeof biasCoords.lng === "number") {
      payload.locationBias = {
        circle: {
          center: {
            latitude: biasCoords.lat,
            longitude: biasCoords.lng,
          },
          radius: 50000.0, // 50 km radius soft bias
        },
      };
    }

    const resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.warn("[PlacesNew] Autocomplete HTTP error:", resp.status);
      return [];
    }

    const data = await resp.json();
    if (!data.suggestions || !Array.isArray(data.suggestions)) return [];

    return data.suggestions
      .filter((s) => s.placePrediction)
      .map((s) => {
        const p = s.placePrediction;
        const main = p.structuredFormat?.mainText?.text || p.text?.text || query;
        const secondary = p.structuredFormat?.secondaryText?.text || "";
        const full = p.text?.text || [main, secondary].filter(Boolean).join(", ");

        return {
          id: p.placeId || p.place,
          placeId: p.placeId || (p.place ? p.place.replace(/^places\//, "") : ""),
          mainText: main,
          secondaryText: secondary,
          fullText: full,
        };
      });
  } catch (err) {
    console.warn("[PlacesNew] Autocomplete fetch exception:", err.message);
    return [];
  }
}

/**
 * Mengambil detail koordinat (lat/lng) dan formattedAddress lengkap dari Place ID Places API (New).
 *
 * @param {string} placeId - ID unik tempat Google (contoh: "ChIJmQhPXH0dvy0RVDAu7lK-s98")
 * @param {string} [sessionToken] - Token sesi pencarian untuk penutupan billing sesi Google Cloud
 * @returns {Promise<{ lat: number, lng: number, formattedAddress: string, displayName: string } | null>}
 */
export async function fetchPlaceNewDetails(placeId, sessionToken = null) {
  if (!placeId) return null;
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  const cleanId = placeId.replace(/^places\//, "");

  try {
    let url = `https://places.googleapis.com/v1/places/${encodeURIComponent(cleanId)}?fields=id,displayName,formattedAddress,location&key=${encodeURIComponent(apiKey)}&languageCode=id`;
    if (sessionToken) {
      url += `&sessionToken=${encodeURIComponent(sessionToken)}`;
    }

    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!resp.ok) {
      console.warn("[PlacesNew] Place Details HTTP error:", resp.status);
      return null;
    }

    const data = await resp.json();
    if (!data || !data.location) return null;

    return {
      lat: Number(data.location.latitude.toFixed(6)),
      lng: Number(data.location.longitude.toFixed(6)),
      formattedAddress: data.formattedAddress || data.displayName?.text || "",
      displayName: data.displayName?.text || "",
    };
  } catch (err) {
    console.warn("[PlacesNew] Place Details fetch exception:", err.message);
    return null;
  }
}
