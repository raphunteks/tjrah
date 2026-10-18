import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { loadGoogleMaps, getGoogleMapsApiKey } from "../../lib/googleMaps.js";
import { reverseGeocode as fallbackReverseGeocode } from "../../lib/geo.js";
import { fetchPlacesNewSuggestions, fetchPlaceNewDetails } from "../../lib/placesNew.js";

// Marker icon SVG yang identik dengan Google Maps Red Pin
const RED_PIN_SVG = `
<svg width="34" height="46" viewBox="0 0 34 46" fill="none" xmlns="http://www.w3.org/2000/svg">
  <filter id="shadow" x="0" y="0" width="34" height="46" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
    <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.35"/>
  </filter>
  <g filter="url(#shadow)">
    <path d="M17 2C10.3726 2 5 7.37258 5 14C5 23 17 38 17 38C17 38 29 23 29 14C29 7.37258 23.6274 2 17 2Z" fill="#EA4335"/>
    <path d="M17 3C10.9249 3 6 7.92487 6 14C6 22.5 17 36.5 17 36.5C17 36.5 28 22.5 28 14C28 7.92487 23.0751 3 17 3Z" stroke="#B31412" stroke-width="1"/>
    <circle cx="17" cy="14" r="5.5" fill="#7A0C0A"/>
    <circle cx="17" cy="14" r="4.2" fill="#FFFFFF"/>
  </g>
</svg>
`;

export default function BranchMapPicker({
  open,
  branchName = "Cabang",
  initialLat,
  initialLng,
  initialAddress = "",
  onClose,
  onSelect,
}) {
  const dialogRef = useRef(null);
  const mapContainerRef = useRef(null);
  const inputSearchRef = useRef(null);

  // Default ke koordinat tersimpan, atau Makassar (-5.147665, 119.432731)
  const defaultLat = Number(initialLat) && !isNaN(Number(initialLat)) ? Number(initialLat) : -5.147665;
  const defaultLng = Number(initialLng) && !isNaN(Number(initialLng)) ? Number(initialLng) : 119.432731;

  const [coords, setCoords] = useState({ lat: defaultLat, lng: defaultLng });
  const [address, setAddress] = useState(initialAddress || "");
  const [addressLoading, setAddressLoading] = useState(false);
  const [mapType, setMapType] = useState("roadmap"); // 'roadmap' | 'satellite'
  const [searchVal, setSearchVal] = useState("");
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  // Autocomplete suggestions (Places API New)
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef(null);
  const sessionTokenRef = useRef(null);

  // Instance Google Maps
  const googleRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);

  // Instance Leaflet Fallback
  const leafletMapRef = useRef(null);
  const leafletMarkerRef = useRef(null);
  const leafletTileRef = useRef(null);

  // Handle native <dialog> showModal / close
  useLayoutEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Reset koordinat saat modal terbuka
  useEffect(() => {
    if (open) {
      setCoords({ lat: defaultLat, lng: defaultLng });
      setAddress(initialAddress || "");
      setSearchVal(initialAddress || "");
      setIsFallbackMode(false);
      setSuggestions([]);
      setShowDropdown(false);
    }
  }, [open, defaultLat, defaultLng, initialAddress]);

  // Set Marker Position (kompatibel AdvancedMarkerElement dan legacy Marker)
  const updateMarkerPosition = (newLat, newLng) => {
    if (markerRef.current) {
      if (typeof markerRef.current.setPosition === "function") {
        markerRef.current.setPosition({ lat: newLat, lng: newLng });
      } else {
        markerRef.current.position = { lat: newLat, lng: newLng };
      }
    }
    if (leafletMarkerRef.current) {
      leafletMarkerRef.current.setLatLng([newLat, newLng]);
    }
  };

  // Reverse geocoding via Google Geocoder atau Fallback OSM
  const reverseGeocodeGoogle = (lat, lng) => {
    setAddressLoading(true);
    if (!isFallbackMode && geocoderRef.current) {
      geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          setAddressLoading(false);
          const full = results[0].formatted_address;
          setAddress(full);
          setSearchVal(full);
        } else {
          fallbackReverseGeocode(lat, lng)
            .then((res) => {
              if (res && (res.address || res.road)) {
                setAddress(res.address || res.road);
                setSearchVal(res.address || res.road);
              }
            })
            .finally(() => setAddressLoading(false));
        }
      });
    } else {
      fallbackReverseGeocode(lat, lng)
        .then((res) => {
          if (res && (res.address || res.road)) {
            setAddress(res.address || res.road);
            setSearchVal(res.address || res.road);
          }
        })
        .finally(() => setAddressLoading(false));
    }
  };

  // Inisialisasi Peta (Google Maps dengan Auto-Fallback ke Leaflet jika auth gagal)
  useEffect(() => {
    if (!open) return;
    let isCancelled = false;

    // Bersihkan container saat buka
    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = "";
    }

    // Engine fallback jika Google Maps API loader offline/terkendala
    async function initLeafletFallback() {
      if (typeof window === "undefined" || !mapContainerRef.current) return;
      setIsFallbackMode(true);

      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (isCancelled || !mapContainerRef.current) return;

      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch {}
        leafletMapRef.current = null;
      }

      mapContainerRef.current.innerHTML = "";

      const map = L.map(mapContainerRef.current, {
        center: [coords.lat, coords.lng],
        zoom: 16,
        zoomControl: false,
      });
      leafletMapRef.current = map;

      const googleRoadmapUrl = "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
      const googleSatUrl = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
      const currentTile = L.tileLayer(mapType === "satellite" ? googleSatUrl : googleRoadmapUrl, {
        maxZoom: 20,
        attribution: "&copy; Google Maps",
      }).addTo(map);
      leafletTileRef.current = currentTile;

      const customIcon = L.divIcon({
        className: "custom-red-pin-marker",
        html: RED_PIN_SVG,
        iconSize: [34, 46],
        iconAnchor: [17, 42],
      });

      const marker = L.marker([coords.lat, coords.lng], { icon: customIcon, draggable: true }).addTo(map);
      leafletMarkerRef.current = marker;

      marker.on("dragend", () => {
        const p = marker.getLatLng();
        const nLat = Number(p.lat.toFixed(6));
        const nLng = Number(p.lng.toFixed(6));
        setCoords({ lat: nLat, lng: nLng });
        fallbackReverseGeocode(nLat, nLng).then((res) => {
          if (res) {
            setAddress(res.address || res.road);
            setSearchVal(res.address || res.road);
          }
        });
      });

      map.on("click", (e) => {
        const nLat = Number(e.latlng.lat.toFixed(6));
        const nLng = Number(e.latlng.lng.toFixed(6));
        marker.setLatLng([nLat, nLng]);
        setCoords({ lat: nLat, lng: nLng });
        fallbackReverseGeocode(nLat, nLng).then((res) => {
          if (res) {
            setAddress(res.address || res.road);
            setSearchVal(res.address || res.road);
          }
        });
      });

      setTimeout(() => {
        if (leafletMapRef.current) leafletMapRef.current.invalidateSize();
      }, 250);
    }

    async function initMap() {
      if (typeof window === "undefined" || !mapContainerRef.current) return;

      // Pasang gm_authFailure handler agar saat RefererNotAllowedMapError terjadi,
      // aplikasi langsung beralih mulus ke Leaflet tanpa menampilkan layar abu-abu error
      window.gm_authFailure = () => {
        console.warn("[GoogleMaps] Terdeteksi gm_authFailure. Beralih mulus ke Leaflet Engine.");
        initLeafletFallback();
      };

      try {
        const apiKey = getGoogleMapsApiKey();
        if (!apiKey) {
          initLeafletFallback();
          return;
        }

        const google = await loadGoogleMaps();
        if (isCancelled || !mapContainerRef.current) return;

        googleRef.current = google;
        geocoderRef.current = new google.maps.Geocoder();

        // 1. Inisialisasi Peta Google Maps Asli (dengan mapId untuk mendukung modern marker)
        const map = new google.maps.Map(mapContainerRef.current, {
          center: { lat: coords.lat, lng: coords.lng },
          zoom: 17,
          mapId: "DEMO_MAP_ID",
          mapTypeId: mapType === "satellite" ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP,
          mapTypeControl: false,
          streetViewControl: true, // Ikon Pegman Street View di pojok kanan bawah
          fullscreenControl: false,
          zoomControl: false,
          clickableIcons: true,
        });
        mapInstanceRef.current = map;

        // 2. Pasang Marker (Mendukung AdvancedMarkerElement modern untuk menghilangkan deprecation warning)
        let marker = null;
        if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
          marker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: coords.lat, lng: coords.lng },
            map: map,
            gmpDraggable: true,
            title: branchName || "Lokasi Cabang",
          });

          const onMarkerDragEnd = () => {
            const pos = marker.position;
            if (!pos) return;
            const rawLat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
            const rawLng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
            const newLat = Number(Number(rawLat).toFixed(6));
            const newLng = Number(Number(rawLng).toFixed(6));
            setCoords({ lat: newLat, lng: newLng });
            reverseGeocodeGoogle(newLat, newLng);
          };

          // Gunakan standard addEventListener dengan event resmi 'gmp-dragend' untuk <gmp-advanced-marker>
          if (typeof marker.addEventListener === "function") {
            marker.addEventListener("gmp-dragend", onMarkerDragEnd);
          } else if (typeof marker.addListener === "function") {
            marker.addListener("dragend", onMarkerDragEnd);
          }
        } else {
          marker = new google.maps.Marker({
            position: { lat: coords.lat, lng: coords.lng },
            map: map,
            draggable: true,
            title: branchName || "Lokasi Cabang",
            animation: google.maps.Animation.DROP,
          });

          marker.addListener("dragend", () => {
            const pos = marker.getPosition();
            const newLat = Number(pos.lat.toFixed(6));
            const newLng = Number(pos.lng.toFixed(6));
            setCoords({ lat: newLat, lng: newLng });
            reverseGeocodeGoogle(newLat, newLng);
          });
        }
        markerRef.current = marker;

        // Listener klik area mana saja di peta
        map.addListener("click", (e) => {
          const pos = e.latLng;
          const newLat = Number(pos.lat().toFixed(6));
          const newLng = Number(pos.lng().toFixed(6));
          updateMarkerPosition(newLat, newLng);
          setCoords({ lat: newLat, lng: newLng });
          reverseGeocodeGoogle(newLat, newLng);
        });

      } catch (err) {
        console.warn("[BranchMapPicker] Menggunakan Fallback Leaflet engine:", err.message);
        initLeafletFallback();
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (markerRef.current) {
        if (markerRef.current.setMap) markerRef.current.setMap(null);
        markerRef.current.map = null;
      }
    };
  }, [open]);

  // Ganti tipe peta (Roadmap vs Satelit)
  useEffect(() => {
    if (mapInstanceRef.current && googleRef.current && !isFallbackMode) {
      const g = googleRef.current;
      mapInstanceRef.current.setMapTypeId(
        mapType === "satellite" ? g.maps.MapTypeId.HYBRID : g.maps.MapTypeId.ROADMAP
      );
    }
    if (leafletTileRef.current && isFallbackMode) {
      const googleRoadmapUrl = "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
      const googleSatUrl = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
      leafletTileRef.current.setUrl(mapType === "satellite" ? googleSatUrl : googleRoadmapUrl);
    }
  }, [mapType, isFallbackMode]);

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLER PENCARIAN ALAMAT: GOOGLE PLACES API (NEW)
  // Menghubungkan langsung ke endpoint resmi https://places.googleapis.com/v1/places:autocomplete
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSearchInput = (val) => {
    setSearchVal(val);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!val.trim() || val.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    const token = sessionTokenRef.current;

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // 1. Ambil saran dari Google Places API (New)
        const items = await fetchPlacesNewSuggestions(val, coords, token);

        if (items && items.length > 0) {
          setSuggestions(items);
          setShowDropdown(true);
          return;
        }

        // 2. Fallback pencarian Photon/OSM jika Google Places kosong atau offline
        const q = encodeURIComponent(val.trim());
        const resp = await fetch(
          `https://photon.komoot.io/api/?q=${q}&lat=${coords.lat}&lon=${coords.lng}&limit=5`
        );
        const data = await resp.json();
        const fallbackItems = (data.features || []).map((f) => {
          const p = f.properties || {};
          const label = p.name || p.street || p.district || "";
          const sub = [p.district, p.city, p.state, p.country].filter(Boolean).join(", ");
          return {
            id: f.geometry.coordinates.join(","),
            placeId: null,
            mainText: label || val,
            secondaryText: sub,
            fullText: [label, sub].filter(Boolean).join(", "),
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
          };
        });
        setSuggestions(fallbackItems);
        setShowDropdown(fallbackItems.length > 0);
      } catch (err) {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  // Pilih item dari dropdown saran Places API (New)
  const selectSuggestion = async (item) => {
    setShowDropdown(false);
    setSearchVal(item.mainText);

    // 1. Jika item memiliki placeId Google Places API (New)
    if (item.placeId) {
      setAddressLoading(true);
      const token = sessionTokenRef.current;
      sessionTokenRef.current = null; // Tutup sesi billing Google Places API (New)
      const detail = await fetchPlaceNewDetails(item.placeId, token);
      setAddressLoading(false);

      if (detail && detail.lat && detail.lng) {
        const newLat = detail.lat;
        const newLng = detail.lng;
        const newAddr = detail.formattedAddress || item.fullText || item.mainText;

        setCoords({ lat: newLat, lng: newLng });
        setAddress(newAddr);
        setSearchVal(newAddr);

        if (mapInstanceRef.current && !isFallbackMode) {
          mapInstanceRef.current.panTo({ lat: newLat, lng: newLng });
          mapInstanceRef.current.setZoom(18);
        }
        updateMarkerPosition(newLat, newLng);

        if (leafletMapRef.current && isFallbackMode) {
          leafletMapRef.current.flyTo([newLat, newLng], 18, { duration: 1 });
        }
        return;
      }
    }

    // 2. Fallback item yang sudah memiliki koordinat langsung
    if (typeof item.lat === "number" && typeof item.lng === "number") {
      const newLat = Number(item.lat.toFixed(6));
      const newLng = Number(item.lng.toFixed(6));
      setCoords({ lat: newLat, lng: newLng });
      setAddress(item.fullText || item.mainText);
      setSearchVal(item.fullText || item.mainText);

      if (mapInstanceRef.current && !isFallbackMode) {
        mapInstanceRef.current.panTo({ lat: newLat, lng: newLng });
        mapInstanceRef.current.setZoom(18);
      }
      updateMarkerPosition(newLat, newLng);

      if (leafletMapRef.current && isFallbackMode) {
        leafletMapRef.current.flyTo([newLat, newLng], 18, { duration: 1 });
      }
    }
  };

  // Deteksi lokasi perangkat GPS saat ini
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Browser tidak mendukung geolokasi.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const curLat = Number(pos.coords.latitude.toFixed(6));
        const curLng = Number(pos.coords.longitude.toFixed(6));
        setCoords({ lat: curLat, lng: curLng });

        if (mapInstanceRef.current && !isFallbackMode) {
          mapInstanceRef.current.panTo({ lat: curLat, lng: curLng });
          mapInstanceRef.current.setZoom(18);
        }
        updateMarkerPosition(curLat, curLng);

        if (leafletMapRef.current && isFallbackMode) {
          leafletMapRef.current.flyTo([curLat, curLng], 17, { duration: 1 });
        }
        reverseGeocodeGoogle(curLat, curLng);
      },
      (err) => {
        alert(`Gagal mengambil lokasi GPS: ${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Reset ke pin awal
  const handleResetPin = () => {
    setCoords({ lat: defaultLat, lng: defaultLng });
    if (mapInstanceRef.current && !isFallbackMode) {
      mapInstanceRef.current.panTo({ lat: defaultLat, lng: defaultLng });
      mapInstanceRef.current.setZoom(17);
    }
    updateMarkerPosition(defaultLat, defaultLng);

    if (leafletMapRef.current && isFallbackMode) {
      leafletMapRef.current.flyTo([defaultLat, defaultLng], 16, { duration: 0.8 });
    }
    if (initialAddress) {
      setAddress(initialAddress);
      setSearchVal(initialAddress);
    }
  };

  // Konfirmasi pilih lokasi
  const handleConfirm = () => {
    onSelect({
      lat: coords.lat,
      lng: coords.lng,
      address: address.trim() || initialAddress || "",
    });
    onClose();
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="d-map-picker-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label="Atur titik lokasi cabang Google Maps"
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#FFFFFF",
        }}
      >
        {/* ────────────────── 1. HEADER MODAL (GAMBAR 1) ────────────────── */}
        <header
          style={{
            height: "64px",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 1.5rem",
            background: "#FFFFFF",
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Peta"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                border: "1px solid #CBD5E1",
                background: "#F8FAFC",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
                color: "#334155",
              }}
            >
              ✕
            </button>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#0F172A", lineHeight: 1.2 }}>
                Atur titik lokasi cabang
              </h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "#64748B", lineHeight: 1.3 }}>
                {branchName || "Outlet Baru"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={handleResetPin}
              style={{
                padding: "0.55rem 1rem",
                background: "#F1F5F9",
                border: "1px solid #CBD5E1",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#334155",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <span>↺</span>
              <span>Kembali ke pin tersimpan</span>
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                padding: "0.55rem 1.25rem",
                background: "#F97316", // Aksen Orange identik Gambar 1
                border: "none",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "#FFFFFF",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 2px 4px rgba(249, 115, 22, 0.3)",
              }}
            >
              <span>✓</span>
              <span>Gunakan lokasi ini</span>
            </button>
          </div>
        </header>

        {/* ────────────────── 2. BODY SPLIT (MAP + SIDEBAR) ────────────────── */}
        <div style={{ display: "flex", flex: 1, position: "relative", overflow: "hidden" }}>
          {/* AREA PETA INTERAKTIF GOOGLE MAPS ASLI (GAMBAR 1) */}
          <div style={{ flex: 1, position: "relative", height: "100%" }}>
            <div ref={mapContainerRef} style={{ width: "100%", height: "100%", zIndex: 1 }} />

            {/* SEARCH BOX GOOGLE PLACES API (NEW) - PERSIS GAMBAR 1 */}
            <div
              style={{
                position: "absolute",
                top: "1.25rem",
                left: "1.25rem",
                zIndex: 1000,
                width: "400px",
                maxWidth: "calc(100vw - 360px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#FFFFFF",
                  borderRadius: "12px",
                  border: "2px solid #F97316",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
                  padding: "0.6rem 0.85rem",
                  gap: "0.5rem",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  ref={inputSearchRef}
                  type="text"
                  placeholder="Cari jalan, gedung, atau tempat..."
                  value={searchVal}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                  style={{
                    border: "none",
                    outline: "none",
                    flex: 1,
                    fontSize: "0.9375rem",
                    color: "#0F172A",
                    background: "transparent",
                    fontWeight: 500,
                  }}
                />
                {searching ? (
                  <span style={{ fontSize: "0.75rem", color: "#F97316" }}>...</span>
                ) : searchVal ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchVal("");
                      setSuggestions([]);
                      setShowDropdown(false);
                      if (inputSearchRef.current) {
                        inputSearchRef.current.value = "";
                        inputSearchRef.current.focus();
                      }
                    }}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", fontSize: "0.9rem" }}
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              {/* DROPDOWN HASIL SARAN PENCARIAN GOOGLE PLACES API (NEW) - PERSIS GAMBAR 1 */}
              {showDropdown && suggestions.length > 0 && (
                <ul
                  style={{
                    margin: "0.4rem 0 0",
                    padding: "0.4rem 0 0",
                    listStyle: "none",
                    background: "#FFFFFF",
                    borderRadius: "12px",
                    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.18)",
                    border: "1px solid #E2E8F0",
                    maxHeight: "320px",
                    overflowY: "auto",
                  }}
                >
                  {suggestions.map((item) => (
                    <li
                      key={item.id}
                      onClick={() => selectSuggestion(item)}
                      style={{
                        padding: "0.65rem 1rem",
                        cursor: "pointer",
                        borderBottom: "1px solid #F1F5F9",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.65rem",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#FFF7ED")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                    >
                      <span style={{ color: "#F97316", marginTop: "2px", fontSize: "0.95rem" }}>📍</span>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <strong style={{ display: "block", fontSize: "0.875rem", color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.mainText}
                        </strong>
                        {item.secondaryText && (
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "1px" }}>
                            {item.secondaryText}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                  {/* Footer Resmi powered by Google (Persis Gambar 1) */}
                  <li
                    style={{
                      padding: "0.5rem 1rem 0.4rem",
                      fontSize: "0.6875rem",
                      color: "#94A3B8",
                      textAlign: "right",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "0.3rem",
                      background: "#FAFAFA",
                      borderTop: "1px solid #F1F5F9",
                    }}
                  >
                    <span>powered by</span>
                    <strong style={{ color: "#4285F4" }}>G</strong>
                    <strong style={{ color: "#EA4335" }}>o</strong>
                    <strong style={{ color: "#FBBC05" }}>o</strong>
                    <strong style={{ color: "#4285F4" }}>g</strong>
                    <strong style={{ color: "#34A853" }}>l</strong>
                    <strong style={{ color: "#EA4335" }}>e</strong>
                  </li>
                </ul>
              )}
            </div>

            {/* KONTROL PETA (GPS SAYA & TOGGLE SATELIT/ROADMAP) */}
            <div
              style={{
                position: "absolute",
                right: "1.25rem",
                top: "1.25rem",
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {/* Tombol GPS My Location */}
              <button
                type="button"
                onClick={handleCurrentLocation}
                title="Arahkan ke Lokasi Saya Sekarang"
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "8px",
                  background: "#FFFFFF",
                  border: "1px solid #CBD5E1",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.2rem",
                  color: "#F97316",
                }}
              >
                ⌖
              </button>

              {/* Toggle Satelit vs Roadmap */}
              <button
                type="button"
                onClick={() => setMapType(mapType === "roadmap" ? "satellite" : "roadmap")}
                title="Ubah Tampilan Peta (Satelit / Peta)"
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "8px",
                  background: "#FFFFFF",
                  border: "1px solid #CBD5E1",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#334155",
                }}
              >
                {mapType === "roadmap" ? "SAT" : "MAP"}
              </button>
            </div>
          </div>

          {/* ────────────────── 3. PANEL KANAN (GAMBAR 1) ────────────────── */}
          <aside
            style={{
              width: "320px",
              background: "#F8FAFC",
              borderLeft: "1px solid #E2E8F0",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              zIndex: 10,
              boxShadow: "-4px 0 12px rgba(0, 0, 0, 0.03)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0F172A" }}>
              Titik lokasi cabang
            </h3>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              {/* Latitude Card */}
              <div
                style={{
                  flex: 1,
                  background: "#FFFFFF",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  padding: "0.75rem 0.85rem",
                }}
              >
                <span style={{ display: "block", fontSize: "0.6875rem", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  LATITUDE
                </span>
                <strong style={{ display: "block", fontSize: "0.9375rem", color: "#0F172A", marginTop: "0.2rem", fontFamily: "monospace" }}>
                  {coords.lat.toFixed(6)}
                </strong>
              </div>

              {/* Longitude Card */}
              <div
                style={{
                  flex: 1,
                  background: "#FFFFFF",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  padding: "0.75rem 0.85rem",
                }}
              >
                <span style={{ display: "block", fontSize: "0.6875rem", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  LONGITUDE
                </span>
                <strong style={{ display: "block", fontSize: "0.9375rem", color: "#0F172A", marginTop: "0.2rem", fontFamily: "monospace" }}>
                  {coords.lng.toFixed(6)}
                </strong>
              </div>
            </div>

            {/* Info Card: Ketuk peta untuk memindahkan pin (Gambar 1) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "#FFF7ED",
                border: "1px solid #FED7AA",
                borderRadius: "8px",
                padding: "0.65rem 0.85rem",
                color: "#C2410C",
                fontSize: "0.8125rem",
                fontWeight: 500,
              }}
            >
              <span>ⓘ</span>
              <span>Ketuk peta untuk memindahkan pin.</span>
            </div>

            {/* Alamat Terdeteksi Otomatis */}
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "10px",
                border: "1px solid #E2E8F0",
                padding: "0.85rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#94A3B8", textTransform: "uppercase" }}>
                  Alamat Terdeteksi
                </span>
                {addressLoading && <span style={{ fontSize: "0.6875rem", color: "#F97316" }}>Memuat...</span>}
              </div>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "#334155", lineHeight: 1.4 }}>
                {address || "Memilih titik pada peta..."}
              </p>
            </div>

            {/* Tombol Aksi Bawah */}
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "#0B5D4B", // Warna Brand Tijarah
                  border: "none",
                  borderRadius: "8px",
                  color: "#FFFFFF",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Simpan Titik Ini ke Cabang
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "0.65rem",
                  background: "transparent",
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  color: "#64748B",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
            </div>
          </aside>
        </div>
      </div>
    </dialog>
  );
}
