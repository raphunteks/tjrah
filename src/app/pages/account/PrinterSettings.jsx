import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { PageHead, Modal, Field, Badge } from "../../ui/index.jsx";
import {
  PRINTER_ROLES,
  getPrinterConfig,
  savePrinterConfig,
  executePrint,
  buildReceiptEscPos,
  requestSerialThermalPort,
  getCachedSerialPort,
} from "../../../lib/thermalPrinter.js";

export default function PrinterSettings() {
  const { tenant } = useAuth();
  const [config, setConfig] = useState(getPrinterConfig);
  const [editRole, setEditRole] = useState(null); // 'receipt' | 'item' | 'kitchen' | 'bar'
  const [activeTab, setActiveTab] = useState("serial"); // 'serial' | 'bluetooth' | 'network' | 'browser'
  const [ipInput, setIpInput] = useState("");
  const [portInput, setPortInput] = useState("9100");
  const [paperInput, setPaperInput] = useState("58mm");
  const [aliasNameInput, setAliasNameInput] = useState("");
  const [detectedBluetoothName, setDetectedBluetoothName] = useState("");
  const [serialConnectedName, setSerialConnectedName] = useState("");
  const [serialBusy, setSerialBusy] = useState(false);
  const [testingRole, setTestingRole] = useState(null);
  const [testSuccess, setTestSuccess] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanErr, setScanErr] = useState(null);

  const openModal = (roleId) => {
    const cur = config[roleId] || {};
    setEditRole(roleId);
    setActiveTab(cur.type || "serial");
    setIpInput(cur.ip || "192.168.1.200");
    setPortInput(cur.port || "9100");
    setPaperInput(cur.paper || (roleId === "item" ? "label" : roleId === "receipt" ? "58mm" : "80mm"));
    setAliasNameInput(cur.name || "");
    setDetectedBluetoothName(cur.type === "bluetooth" && cur.name ? cur.name : "");
    setSerialConnectedName(cur.type === "serial" && cur.name ? cur.name : "");
    setScanErr(null);
  };

  const handleSavePrinter = () => {
    if (!editRole) return;
    const finalName =
      aliasNameInput.trim() ||
      serialConnectedName ||
      detectedBluetoothName ||
      (activeTab === "serial"
        ? "BlueTooth Printer (SPP)"
        : activeTab === "bluetooth"
        ? "Printer Thermal Bluetooth"
        : activeTab === "network"
        ? `Printer LAN (${ipInput}:${portInput})`
        : "Printer Bawaan Sistem");

    const updated = {
      ...config,
      [editRole]: {
        type: activeTab,
        ip: ipInput.trim(),
        port: portInput.trim() || "9100",
        paper: paperInput,
        name: finalName,
      },
    };
    setConfig(updated);
    savePrinterConfig(updated);
    setTestSuccess(`Konfigurasi ${PRINTER_ROLES.find((r) => r.id === editRole)?.name || "Printer"} berhasil disimpan!`);
    setTimeout(() => setTestSuccess(null), 4000);
    setEditRole(null);
  };

  const handleTogglePref = (key) => {
    const updated = { ...config, [key]: !config[key] };
    setConfig(updated);
    savePrinterConfig(updated);
  };

  const connectSerial = async () => {
    setSerialBusy(true);
    setScanErr(null);
    try {
      const port = await requestSerialThermalPort();
      const info = port.getInfo ? port.getInfo() : {};
      const sName = info.usbVendorId ? `USB Thermal (Vendor: ${info.usbVendorId})` : "Bluetooth Serial SPP (macOS/Windows)";
      setSerialConnectedName(sName);
      if (!aliasNameInput) setAliasNameInput("BlueTooth Printer (SPP)");
    } catch (err) {
      if (err.name !== "NotFoundError") {
        setScanErr(err.message || "Gagal menghubungkan port serial");
      }
    } finally {
      setSerialBusy(false);
    }
  };

  const scanBluetooth = async () => {
    setScanBusy(true);
    setScanErr(null);
    try {
      if (typeof navigator === "undefined" || !navigator.bluetooth) {
        throw new Error("Web Bluetooth API tidak didukung pada browser ini. Harap gunakan Google Chrome pada Android, Windows, Mac, atau ChromeOS.");
      }
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "000018f0-0000-1000-8000-00805f9b34fb",
          "49535343-fe7d-4ae5-8fa9-9fafd205e455",
          "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
          "0000ae30-0000-1000-8000-00805f9b34fb",
          "0000af30-0000-1000-8000-00805f9b34fb",
          "0000ff00-0000-1000-8000-00805f9b34fb",
          "0000fee7-0000-1000-8000-00805f9b34fb",
        ],
      });
      const dName = device.name || "Printer Bluetooth";
      setDetectedBluetoothName(dName);
      if (!aliasNameInput) setAliasNameInput(dName);
    } catch (err) {
      if (err.name !== "NotFoundError") {
        if (String(err?.message || "").toLowerCase().includes("unsupported")) {
          setScanErr("Perangkat terdeteksi sebagai Bluetooth Classic SPP. Silakan gunakan tab 'Serial / USB (SPP)' di sebelah kiri.");
        } else {
          setScanErr(err.message || "Gagal menghubungkan Bluetooth");
        }
      }
    } finally {
      setScanBusy(false);
    }
  };

  const runTestPrint = async (roleId) => {
    setTestingRole(roleId);
    setTestSuccess(null);
    try {
      const mockOrder = {
        id: "TEST-PRINT",
        code: `TEST-${Date.now().toString().slice(-4)}`,
        channel: "Dine In",
        table_label: "01",
        customer_name: "Uji Coba Printer",
        items: [
          { name: "Kopi Susu Aren", qty: 2, price: 18000, note: "Kurang manis" },
          { name: "Croissant Cokelat", qty: 1, price: 25000 },
        ],
        subtotal: 61000,
        discount: 5000,
        tax: 5600,
        total: 61600,
      };

      const bytes = buildReceiptEscPos({
        order: mockOrder,
        tenant,
        cashierName: "Kasir Bertugas",
      });

      await executePrint({
        role: roleId,
        data: bytes,
        order: mockOrder,
        tenant,
      });

      setTestSuccess(`Uji cetak ${PRINTER_ROLES.find((r) => r.id === roleId)?.name} berhasil dikirim!`);
      setTimeout(() => setTestSuccess(null), 4000);
    } catch (err) {
      alert(err.message || "Gagal melakukan uji cetak");
    } finally {
      setTestingRole(null);
    }
  };

  return (
    <div className="d-page">
      <PageHead
        title="Printer &amp; Preferensi"
        description="Atur printer thermal kasir (Bluetooth, LAN / WiFi Socket, dan USB) untuk cetak struk kwitansi, stiker cup/item, dapur, dan bar."
      />

      {testSuccess && (
        <div style={{ background: "#ecfdf5", border: "1px solid #10b981", color: "#065f46", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{testSuccess}</span>
        </div>
      )}

      {/* Bagian 1: Atur Printer */}
      <section style={{ background: "var(--color-paper)", border: "1px solid var(--color-rule-2)", borderRadius: "var(--radius-lg)", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--color-ink)" }}>
              Atur Printer Thermal
            </h2>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "var(--color-muted)" }}>
              Sesuaikan rute pencetakan dokumen ke masing-masing printer perangkat keras.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          {PRINTER_ROLES.map((role) => {
            const cur = config[role.id] || {};
            const isConfigured = cur.type && cur.type !== "none";

            return (
              <div
                key={role.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem 1.25rem",
                  background: "var(--color-paper-2)",
                  border: "1px solid var(--color-rule)",
                  borderRadius: "var(--radius-md)",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect width="12" height="8" x="6" y="14" />
                    </svg>
                    <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-ink)" }}>
                      {role.name}
                    </span>
                    <Badge tone={cur.type === "serial" ? "ok" : cur.type === "bluetooth" ? "accent" : cur.type === "network" ? "neutral" : "neutral"}>
                      {cur.type === "serial" ? "Serial / SPP" : cur.type === "bluetooth" ? "Bluetooth BLE" : cur.type === "network" ? "LAN / WiFi" : "Sistem Browser"}
                    </Badge>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                      {cur.paper || role.defaultPaper}
                    </span>
                  </div>
                  <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "var(--color-muted)" }}>
                    {role.desc} · <strong style={{ color: "var(--color-ink-2)" }}>{cur.name || "Default Printer"}</strong>
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    disabled={testingRole === role.id}
                    onClick={() => runTestPrint(role.id)}
                  >
                    {testingRole === role.id ? "Mencetak…" : "Uji Cetak"}
                  </button>
                  <button
                    type="button"
                    className="d-btn d-btn--primary d-btn--sm"
                    onClick={() => openModal(role.id)}
                  >
                    {isConfigured ? "Ubah Printer" : "Pilih Printer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bagian 2: Preferensi Cetak */}
      <section style={{ background: "var(--color-paper)", border: "1px solid var(--color-rule-2)", borderRadius: "var(--radius-lg)", padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 1rem", color: "var(--color-ink)" }}>
          Preferensi Tambahan
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "0.75rem", borderBottom: "1px solid var(--color-rule)" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--color-ink)" }}>
                Cetak Struk Otomatis
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                Kirim perintah cetak struk kwitansi seketika kasir menyelesaikan transaksi pembayaran.
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(config.autoPrintReceipt)}
              onChange={() => handleTogglePref("autoPrintReceipt")}
              style={{ width: "20px", height: "20px", cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", paddingBottom: "0.75rem", borderBottom: "1px solid var(--color-rule)" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--color-ink)" }}>
                Buka Laci Kasir Otomatis (Cash Drawer Kick)
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                Kirim sinyal pulse RJ-11 ke laci uang saat transaksi tunai selesai.
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(config.autoDrawerKick)}
              onChange={() => handleTogglePref("autoDrawerKick")}
              style={{ width: "20px", height: "20px", cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--color-ink)" }}>
                Potong Kertas Otomatis (Auto-Cutter)
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                Aktifkan pisau pemotong otomatis printer thermal setelah baris terakhir tercetak.
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(config.autoCutter)}
              onChange={() => handleTogglePref("autoCutter")}
              style={{ width: "20px", height: "20px", cursor: "pointer" }}
            />
          </label>
        </div>
      </section>

      {/* Modal Pemilihan Printer */}
      <Modal
        open={Boolean(editRole)}
        title={`Konfigurasi ${PRINTER_ROLES.find((r) => r.id === editRole)?.name || "Printer"}`}
        onClose={() => setEditRole(null)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setEditRole(null)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--primary"
              onClick={() => handleSavePrinter()}
            >
              Simpan Printer
            </button>
          </>
        }
      >
        <div className="d-form">
          {/* Tab Selector Koneksi */}
          <div className="d-seg" role="tablist" style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "serial"}
              className={activeTab === "serial" ? "is-active" : ""}
              onClick={() => setActiveTab("serial")}
            >
              Serial / USB (SPP)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "bluetooth"}
              className={activeTab === "bluetooth" ? "is-active" : ""}
              onClick={() => setActiveTab("bluetooth")}
            >
              Bluetooth (BLE)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "network"}
              className={activeTab === "network" ? "is-active" : ""}
              onClick={() => setActiveTab("network")}
            >
              Jaringan (LAN / WiFi)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "browser"}
              className={activeTab === "browser" ? "is-active" : ""}
              onClick={() => setActiveTab("browser")}
            >
              Sistem Bawaan
            </button>
          </div>

          {activeTab === "serial" && (
            <div>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "0.85rem", marginBottom: "0.85rem" }}>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#166534", fontWeight: 700 }}>
                  Direkomendasikan untuk &quot;BlueTooth Printer&quot; &amp; macOS / Windows:
                </p>
                <ol style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem", fontSize: "0.8rem", color: "#15803d", lineHeight: 1.6 }}>
                  <li>Pastikan printer sudah terhubung di Bluetooth Mac/Windows Anda (PIN default: <strong>0000</strong> atau <strong>1234</strong>).</li>
                  <li>Klik tombol di bawah untuk memilih port Serial Virtual RFCOMM printer Anda.</li>
                  <li>Setelah terhubung, kasir dapat mencetak otomatis (0ms) tanpa muncul popup lagi!</li>
                </ol>
              </div>

              <button
                type="button"
                className="d-btn d-btn--primary d-btn--block"
                disabled={serialBusy}
                onClick={connectSerial}
              >
                {serialBusy ? "Menghubungkan Port Serial…" : "Hubungkan Port Serial / Bluetooth SPP"}
              </button>

              {serialConnectedName && (
                <div style={{ marginTop: "0.75rem", padding: "8px 12px", background: "#ecfdf5", border: "1px solid #10b981", borderRadius: "6px", color: "#065f46", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>
                    Port Terhubung: <strong>{serialConnectedName}</strong> (Siap Disimpan)
                  </span>
                </div>
              )}
              {scanErr && <p className="d-field__error" style={{ marginTop: "0.5rem" }}>{scanErr}</p>}
            </div>
          )}

          {activeTab === "bluetooth" && (
            <div>
              <p className="d-text" style={{ fontSize: "0.85rem", color: "var(--color-ink-2)" }}>
                Pindai printer thermal Bluetooth di sekitar kasir menggunakan Web Bluetooth API.
              </p>
              <button
                type="button"
                className="d-btn d-btn--primary d-btn--block"
                disabled={scanBusy}
                onClick={scanBluetooth}
                style={{ marginTop: "0.5rem" }}
              >
                {scanBusy ? "Memindai Bluetooth…" : "Pindai Perangkat Bluetooth Sekitar"}
              </button>
              {detectedBluetoothName && (
                <div style={{ marginTop: "0.75rem", padding: "8px 12px", background: "#ecfdf5", border: "1px solid #10b981", borderRadius: "6px", color: "#065f46", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>
                    Perangkat Terhubung: <strong>{detectedBluetoothName}</strong> (Siap Disimpan)
                  </span>
                </div>
              )}
              {scanErr && <p className="d-field__error" style={{ marginTop: "0.5rem" }}>{scanErr}</p>}
            </div>
          )}

          {activeTab === "network" && (
            <div>
              <Field label="Alamat IP Printer (LAN / WiFi)" id="printer-ip" hint="Contoh: 192.168.1.200 (Pastikan printer & kasir dalam satu WiFi).">
                <input
                  id="printer-ip"
                  placeholder="192.168.1.200"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  className="d-mono"
                />
              </Field>
              <Field label="Port Socket Printer" id="printer-port" hint="Standar port raw printer thermal: 9100.">
                <input
                  id="printer-port"
                  placeholder="9100"
                  value={portInput}
                  onChange={(e) => setPortInput(e.target.value)}
                  className="d-mono"
                />
              </Field>
            </div>
          )}

          {activeTab === "browser" && (
            <div>
              <p className="d-text" style={{ fontSize: "0.85rem", color: "var(--color-ink-2)" }}>
                Menggunakan jendela dialog cetak sistem operasi browser. Cocok untuk printer USB kabel atau printer virtual PDF.
              </p>
            </div>
          )}

          <Field label="Nama Alias Printer" id="printer-alias" hint="Beri nama printer ini untuk memudahkan kasir (misal: Printer Kasir Depan).">
            <input
              id="printer-alias"
              placeholder="Contoh: Printer Kasir Meja 1"
              value={aliasNameInput}
              onChange={(e) => setAliasNameInput(e.target.value)}
            />
          </Field>

          <Field label="Ukuran Kertas" id="printer-paper">
            <select
              id="printer-paper"
              value={paperInput}
              onChange={(e) => setPaperInput(e.target.value)}
            >
              <option value="58mm">Thermal 58 mm (Standar Struk Kasir Kecil)</option>
              <option value="80mm">Thermal 80 mm (Standar Struk Kasir Lebar & Dapur)</option>
              <option value="label">Stiker Label 40×30 mm (Label Cup Minuman)</option>
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
