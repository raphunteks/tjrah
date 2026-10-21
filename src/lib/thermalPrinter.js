// Driver Printer Thermal ESC/POS Tijarah OS (58mm, 80mm & Stiker Label)
// Mendukung Web Bluetooth API, Socket Jaringan LAN/WiFi (Port 9100), dan Browser Print Fallback.
// 100% Zero Emoji: Menggunakan format teks terstruktur & escape sequence ESC/POS resmi.

const PRINTER_STORAGE_KEY = "tijarah:printer_config";

export const PRINTER_ROLES = [
  { id: "receipt", name: "Printer Struk", desc: "Kwitansi pembayaran pelanggan", defaultPaper: "58mm" },
  { id: "item", name: "Printer Label Item", desc: "Stiker cup minuman & kemasan (40×30mm)", defaultPaper: "label" },
  { id: "kitchen", name: "Printer Dapur", desc: "Tiket pesanan juru masak dapur", defaultPaper: "80mm" },
  { id: "bar", name: "Printer Bar", desc: "Tiket pesanan barista minuman", defaultPaper: "80mm" },
];

export const DEFAULT_PRINTER_CONFIG = {
  receipt: { type: "browser", ip: "192.168.1.200", port: "9100", paper: "58mm", name: "Printer Struk (Sistem)" },
  item: { type: "browser", ip: "192.168.1.201", port: "9100", paper: "label", name: "Printer Label Item" },
  kitchen: { type: "browser", ip: "192.168.1.202", port: "9100", paper: "80mm", name: "Printer Dapur" },
  bar: { type: "browser", ip: "192.168.1.203", port: "9100", paper: "80mm", name: "Printer Bar" },
  autoPrintReceipt: true,
  autoDrawerKick: true,
  autoCutter: true,
};

export function getPrinterConfig() {
  if (typeof window === "undefined") return DEFAULT_PRINTER_CONFIG;
  try {
    const raw = localStorage.getItem(PRINTER_STORAGE_KEY);
    if (raw) return { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PRINTER_CONFIG;
}

export function savePrinterConfig(cfg) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

/**
 * Buat ESC/POS byte sequence untuk Cetak Struk Pembayaran
 */
export function buildReceiptEscPos({ order, tenant, cashierName = "Kasir" }) {
  const enc = new TextEncoder();
  const ESC = 0x1b;
  const GS = 0x1d;

  const bytes = [];
  const pushStr = (str) => bytes.push(...enc.encode(str));
  const pushCmd = (...cmds) => bytes.push(...cmds);

  // Inisialisasi printer
  pushCmd(ESC, 0x40);

  // Open Drawer jika tunai
  pushCmd(ESC, 0x70, 0x00, 0x19, 0xfa);

  // Center alignment
  pushCmd(ESC, 0x61, 0x01);
  pushCmd(ESC, 0x45, 0x01); // Bold on
  pushCmd(GS, 0x21, 0x11);  // Double size
  pushStr(`${tenant?.name || "TIJARAH POS"}\n`);
  pushCmd(GS, 0x21, 0x00);  // Normal size
  pushCmd(ESC, 0x45, 0x00); // Bold off

  pushStr("Cloud POS & Smart Operating System\n");
  if (order.branch_name) pushStr(`Cabang: ${order.branch_name}\n`);
  pushStr("--------------------------------\n");

  // Left alignment
  pushCmd(ESC, 0x61, 0x00);
  pushStr(`No. Order : #${order.code || order.id}\n`);
  pushStr(`Waktu     : ${new Date().toLocaleDateString("id-ID")} ${new Date().toLocaleTimeString("id-ID")}\n`);
  pushStr(`Kasir     : ${cashierName}\n`);
  if (order.customer_name) pushStr(`Pelanggan : ${order.customer_name}\n`);
  pushStr(`Layanan   : ${(order.channel || "Takeaway").toUpperCase()}\n`);
  pushStr("--------------------------------\n");

  // Items
  const items = order.items || order.rows || [];
  for (const it of items) {
    const name = it.name || it.product_name || "Item";
    const qty = it.qty || 1;
    const price = it.price || 0;
    const subtotal = qty * price;
    pushStr(`${name}\n`);
    pushStr(`  ${qty} x ${price.toLocaleString("id-ID")} = ${subtotal.toLocaleString("id-ID")}\n`);
    if (it.note) pushStr(`  (Catatan: ${it.note})\n`);
  }
  pushStr("--------------------------------\n");

  // Summary
  pushStr(`Subtotal  : Rp ${(order.subtotal || 0).toLocaleString("id-ID")}\n`);
  if (order.discount > 0) pushStr(`Diskon    : -Rp ${Number(order.discount).toLocaleString("id-ID")}\n`);
  if (order.tax > 0) pushStr(`Pajak/PB1 : Rp ${Number(order.tax).toLocaleString("id-ID")}\n`);
  pushCmd(ESC, 0x45, 0x01); // Bold on
  pushStr(`TOTAL     : Rp ${(order.total || order.subtotal || 0).toLocaleString("id-ID")}\n`);
  pushCmd(ESC, 0x45, 0x00); // Bold off
  pushStr("--------------------------------\n");

  // Footer Center
  pushCmd(ESC, 0x61, 0x01);
  pushStr("Terima kasih atas kunjungan Anda!\n");
  pushStr("Struk resmi sah untuk pembukuan.\n\n\n");

  // Auto cut
  pushCmd(GS, 0x56, 0x41, 0x03);

  return new Uint8Array(bytes);
}

/**
 * Buat ESC/POS byte sequence untuk Tiket Dapur / Bar
 */
export function buildKitchenTicketEscPos({ order, station = "Dapur" }) {
  const enc = new TextEncoder();
  const ESC = 0x1b;
  const GS = 0x1d;

  const bytes = [];
  const pushStr = (str) => bytes.push(...enc.encode(str));
  const pushCmd = (...cmds) => bytes.push(...cmds);

  // Inisialisasi
  pushCmd(ESC, 0x40);

  // Center alignment
  pushCmd(ESC, 0x61, 0x01);
  pushCmd(ESC, 0x45, 0x01);
  pushCmd(GS, 0x21, 0x11);
  pushStr(`TIKET ${station.toUpperCase()}\n`);
  pushCmd(GS, 0x21, 0x00);
  pushCmd(ESC, 0x45, 0x00);
  pushStr(`Order: #${order.code || order.id}\n`);
  pushStr(`Tipe: ${(order.channel || "Takeaway").toUpperCase()}\n`);
  if (order.table_label) pushStr(`MEJA: ${order.table_label}\n`);
  pushStr("================================\n");

  // Left alignment
  pushCmd(ESC, 0x61, 0x00);
  pushCmd(ESC, 0x45, 0x01);
  const items = order.items || [];
  for (const it of items) {
    pushStr(`[ ] ${it.qty || 1}x ${it.name || it.product_name}\n`);
    if (it.note) {
      pushCmd(ESC, 0x45, 0x00);
      pushStr(`    ** ${it.note} **\n`);
      pushCmd(ESC, 0x45, 0x01);
    }
  }
  pushCmd(ESC, 0x45, 0x00);
  pushStr("================================\n");
  pushStr(`Waktu: ${new Date().toLocaleTimeString("id-ID")}\n\n\n`);

  // Auto cut
  pushCmd(GS, 0x56, 0x41, 0x03);

  return new Uint8Array(bytes);
}

/**
 * Buat ESC/POS byte sequence untuk Stiker Label Item Cup (40x30mm)
 */
export function buildItemLabelEscPos({ item, order, index = 1, totalItems = 1 }) {
  const enc = new TextEncoder();
  const ESC = 0x1b;
  const GS = 0x1d;

  const bytes = [];
  const pushStr = (str) => bytes.push(...enc.encode(str));
  const pushCmd = (...cmds) => bytes.push(...cmds);

  pushCmd(ESC, 0x40);
  pushCmd(ESC, 0x61, 0x01);
  pushCmd(ESC, 0x45, 0x01);
  pushStr(`${item.name || item.product_name}\n`);
  pushCmd(ESC, 0x45, 0x00);

  if (item.note) {
    pushStr(`(${item.note})\n`);
  }

  pushCmd(ESC, 0x61, 0x00);
  pushStr(`Ord: #${order.code || "TIJARAH"} [${index}/${totalItems}]\n`);
  if (order.customer_name) pushStr(`Cust: ${order.customer_name}\n`);
  pushStr(`Jam: ${new Date().toLocaleTimeString("id-ID")}\n\n`);

  // Form feed / cut
  pushCmd(GS, 0x56, 0x41, 0x00);

  return new Uint8Array(bytes);
}

let cachedSerialPort = null;
let cachedBleDevice = null;

export async function getCachedSerialPort() {
  if (cachedSerialPort) return cachedSerialPort;
  if (typeof navigator !== "undefined" && navigator.serial) {
    try {
      const ports = await navigator.serial.getPorts();
      if (ports && ports.length > 0) {
        cachedSerialPort = ports[0];
        return cachedSerialPort;
      }
    } catch {}
  }
  return null;
}

export async function requestSerialThermalPort() {
  if (typeof navigator === "undefined" || !navigator.serial) {
    throw new Error(
      "Web Serial API tidak didukung pada browser ini. Harap gunakan Google Chrome atau Microsoft Edge pada laptop/PC (macOS/Windows)."
    );
  }
  const port = await navigator.serial.requestPort();
  cachedSerialPort = port;
  return port;
}

export async function sendSerialPrint(port, data, baudRate = 9600) {
  if (!port) throw new Error("Port Serial / USB tidak terhubung.");
  if (!port.writable) {
    await port.open({ baudRate });
  }
  const writer = port.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

const BLE_PRINT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000af30-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
];

export async function requestBluetoothThermalDevice() {
  if (typeof navigator === "undefined" || !navigator.bluetooth) {
    throw new Error("Web Bluetooth API tidak didukung di browser ini. Gunakan Google Chrome pada Android, Windows, Mac, atau ChromeOS.");
  }
  if (cachedBleDevice && cachedBleDevice.gatt?.connected) {
    return cachedBleDevice;
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_PRINT_SERVICES,
  });
  cachedBleDevice = device;
  return device;
}

/**
 * Eksekusi cetak universal (Serial / USB SPP, Bluetooth BLE, LAN / WiFi Socket, atau Browser Print)
 */
export async function executePrint({ role = "receipt", data, order, tenant, htmlFallback }) {
  const cfg = getPrinterConfig();
  const printer = cfg[role] || cfg.receipt;

  // 1. Mode Web Serial API (RFCOMM Classic SPP macOS/Windows & Direct USB)
  if (printer.type === "serial") {
    let port = await getCachedSerialPort();
    if (!port) {
      port = await requestSerialThermalPort();
    }
    await sendSerialPrint(port, data);
    return { ok: true, method: "serial" };
  }

  // 2. Mode Web Bluetooth
  if (printer.type === "bluetooth") {
    if (typeof navigator === "undefined" || !navigator.bluetooth) {
      throw new Error("Web Bluetooth API tidak didukung di browser ini. Gunakan Google Chrome atau Edge.");
    }
    const device = await requestBluetoothThermalDevice();
    let server;
    try {
      server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    } catch (connErr) {
      if (String(connErr?.message || "").toLowerCase().includes("unsupported")) {
        throw new Error(
          "Perangkat '" +
            (device.name || "BlueTooth Printer") +
            "' adalah Bluetooth Classic SPP (bukan BLE). Silakan buka menu Printer & Preferensi lalu pilih mode 'Serial / USB (SPP)' untuk mencetak langsung."
        );
      }
      throw connErr;
    }

    // Temukan primary service dan karakteristik penulisan yang valid
    let writeChar = null;
    for (const sUuid of BLE_PRINT_SERVICES) {
      try {
        const service = await server.getPrimaryService(sUuid);
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
            break;
          }
        }
        if (writeChar) break;
      } catch {}
    }

    if (!writeChar) {
      throw new Error(
        "Karakteristik Bluetooth ESC/POS tidak ditemukan. Jika printer Anda menggunakan Bluetooth SPP standar (PIN 0000/1234), gunakan tab 'Serial / USB (SPP)'."
      );
    }

    // Kirim data byte per chunk 128 byte agar buffer BLE stabil
    const chunkSize = 128;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      if (writeChar.writeValueWithoutResponse) {
        await writeChar.writeValueWithoutResponse(chunk);
      } else {
        await writeChar.writeValue(chunk);
      }
    }

    return { ok: true, method: "bluetooth", deviceName: device.name };
  }

  // 2. Mode Jaringan LAN / WiFi Socket (Raw 9100)
  if (printer.type === "network") {
    const isBrowser = typeof window !== "undefined";
    const isDev = isBrowser && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (!isDev) {
      // Pada cloud/production, buka popup browser print langsung agar user bisa memilih printer thermal jaringan yang terpasang di OS
      window.print();
      return { ok: true, method: "network_print_dialog" };
    }
    // Jika ada proxy thermal local bridge:
    try {
      const res = await fetch(`http://${printer.ip}:${printer.port || "9100"}`, {
        method: "POST",
        body: data,
        mode: "no-cors",
      });
      return { ok: true, method: "network" };
    } catch {
      // Fallback mulus ke browser print
      window.print();
      return { ok: true, method: "network_fallback" };
    }
  }

  // 3. Fallback: Browser Print Dialog
  const printWindow = window.open("", "_blank", "width=380,height=600");
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak - Tijarah OS</title>
          <style>
            @page { size: ${printer.paper === "80mm" ? "80mm auto" : printer.paper === "label" ? "40mm 30mm" : "58mm auto"}; margin: 0; }
            body { font-family: monospace; font-size: 11px; margin: 6px; color: #000; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
          </style>
        </head>
        <body>
          ${htmlFallback || `
            <div class="center bold" style="font-size: 14px;">${tenant?.name || "TIJARAH POS"}</div>
            <div class="center">Cloud POS & Smart Operating System</div>
            <hr />
            <div>No: #${order?.code || order?.id || "ORDER"}</div>
            <div>Waktu: ${new Date().toLocaleString("id-ID")}</div>
            <div>Layanan: ${(order?.channel || "Takeaway").toUpperCase()}</div>
            <hr />
            ${(order?.items || []).map((it) => `
              <div class="row">
                <span>${it.qty || 1}x ${it.name || it.product_name}</span>
                <span>${((it.qty || 1) * (it.price || 0)).toLocaleString("id-ID")}</span>
              </div>
            `).join("")}
            <hr />
            <div class="row bold">
              <span>TOTAL</span>
              <span>Rp ${(order?.total || order?.subtotal || 0).toLocaleString("id-ID")}</span>
            </div>
            <hr />
            <div class="center">Terima kasih atas kunjungan Anda!</div>
          `}
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    return { ok: true, method: "browser_window" };
  } else {
    window.print();
    return { ok: true, method: "browser_native" };
  }
}
