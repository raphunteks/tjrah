/**
 * ============================================================================
 * TIJARAH OS · HERMES WHATSAPP NOTIFICATION CLIENT DISPATCHER
 * ============================================================================
 * Modul penghubung frontend ke endpoint proxy /api/hermes-dispatch.
 * Menyediakan helper terpusat untuk notifikasi realtime seluruh peran (RBAC):
 * - Security: Deteksi Login Akun Baru, Perubahan 2FA, PIN Transaksi
 * - Finance: Mutasi Saldo Top-Up S-Wallet, Transfer P2P In/Out, Penarikan Bank
 * - Operations: Transaksi Sukses Kasir POS (ke Owner & GM), Z-Report, Void Nota
 * ============================================================================
 */

const DEFAULT_TARGET_PHONE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_HERMES_DEFAULT_PHONE) || "6285256739684";

export async function dispatchHermesEvent({
  event,
  tenant,
  tenant_name,
  branch,
  branch_name,
  target,
  targets,
  data = {},
  message = null
}) {
  try {
    const finalTarget = target || DEFAULT_TARGET_PHONE;
    const finalTargets = targets && Array.isArray(targets) && targets.length > 0 ? targets : [finalTarget];

    const payload = {
      event,
      kind: event,
      tenant: tenant || tenant_name || "Tijarah Merchant",
      tenant_name: tenant || tenant_name || "Tijarah Merchant",
      branch: branch || branch_name || "Cabang Utama",
      branch_name: branch || branch_name || "Cabang Utama",
      target: finalTarget,
      target_phone: finalTarget,
      targets: finalTargets,
      data: {
        ...data,
        timestamp: data.timestamp || new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
      },
      message
    };

    const res = await fetch("/api/hermes-dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);

    if (res && res.ok) {
      return await res.json().catch(() => ({ ok: true }));
    }
    return { ok: false };
  } catch (err) {
    console.warn("[Hermes Client] Gagal dispatch event:", event, err);
    return { ok: false, error: err.message };
  }
}

/**
 * 1. NOTIFIKASI LOGIN AKUN BARU (SELURUH ROLE RBAC)
 */
export async function dispatchHermesLoginAlert(profile, options = {}) {
  if (!profile) return;

  // Cegah spam dalam 1 sesi browser yang sama
  const sessionKey = `tijarah:hermes_login_alert:${profile.id || profile.email || "user"}`;
  try {
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, String(Date.now()));
  } catch {}

  const isMobile = typeof navigator !== "undefined" && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  const deviceLabel = isMobile ? "Perangkat Mobile (Ponsel)" : "Desktop Browser (Chrome/Mac/PC)";

  const roleLabels = {
    superadmin: "Superadmin (Platform)",
    owner: "Pemilik Usaha (Owner)",
    gm: "General Manager (GM)",
    staff: "Staf Kasir / Operasional",
    dokter: "Dokter Medis / Praktisi",
    member: "Pelanggan / Member"
  };
  const roleLabel = roleLabels[profile.role] || profile.role || "Merchant User";

  const targetPhone = profile.phone || profile.whatsapp_owner || DEFAULT_TARGET_PHONE;

  return dispatchHermesEvent({
    event: "login_alert",
    tenant: profile.tenant?.name || profile.tenant_name || "Tijarah Merchant",
    branch: profile.branch?.name || profile.branch_name || "Pusat",
    target: targetPhone,
    data: {
      user_name: profile.full_name || profile.email?.split("@")[0] || "Pengguna",
      user_email: profile.email || "-",
      role: profile.role || "staff",
      role_label: roleLabel,
      device: deviceLabel,
      ip_address: "127.0.0.1 (Lokal)",
      timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
    }
  });
}

/**
 * 2. NOTIFIKASI TRANSAKSI KASIR POS SUKSES (DIKIRIM KE OWNER & GM)
 */
export async function dispatchHermesPosSale({
  order,
  total,
  paymentMethod = "Tunai",
  cashierName = "Kasir",
  tenantName = "Tijarah Merchant",
  branchName = "Cabang Utama",
  whatsappOwner = null,
  whatsappGm = null
}) {
  if (!order) return;

  let itemsSummary = "";
  if (Array.isArray(order.items)) {
    itemsSummary = order.items.map((i) => `  - ${i.name || "Menu"} × ${i.quantity || 1}`).join("\n");
  }

  const targets = [whatsappOwner || DEFAULT_TARGET_PHONE];
  if (whatsappGm && whatsappGm !== whatsappOwner) {
    targets.push(whatsappGm);
  }

  return dispatchHermesEvent({
    event: "pos_sale",
    tenant: tenantName,
    branch: branchName,
    target: targets[0],
    targets,
    data: {
      order_code: order.code || "NOTA-POS",
      cashier_name: cashierName,
      table_label: order.table_label || null,
      customer_name: order.customer_name || null,
      total: Number(total || order.total || 0),
      payment_method: paymentMethod,
      items_summary: itemsSummary,
      timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
    }
  });
}

/**
 * 3. NOTIFIKASI TOP-UP SALDO S-WALLET (MUTASI KREDIT)
 */
export async function dispatchHermesWalletTopup({
  amount,
  method = "qris",
  refNo,
  newBalance = 0,
  user = {},
  tenantName = "Tijarah Merchant"
}) {
  const targetPhone = user.phone || user.whatsapp_owner || DEFAULT_TARGET_PHONE;

  return dispatchHermesEvent({
    event: "wallet_topup",
    tenant: tenantName,
    target: targetPhone,
    data: {
      amount: Number(amount || 0),
      method: method === "qris" ? "QRIS Instan" : "Virtual Account",
      ref_no: refNo || "TOPUP-" + Date.now().toString().slice(-6),
      new_balance: Number(newBalance || 0),
      timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
    }
  });
}

/**
 * 4. NOTIFIKASI TRANSFER SALDO P2P S-WALLET (PENGIRIM & PENERIMA)
 */
export async function dispatchHermesWalletTransfer({
  sender = {},
  receiverIdentifier = "Penerima",
  amount,
  refNo,
  newBalance = 0,
  notes = "",
  tenantName = "Tijarah Merchant"
}) {
  const senderPhone = sender.phone || sender.whatsapp_owner || DEFAULT_TARGET_PHONE;

  return dispatchHermesEvent({
    event: "wallet_transfer_out",
    tenant: tenantName,
    target: senderPhone,
    data: {
      receiver_identifier: receiverIdentifier,
      amount: Number(amount || 0),
      ref_no: refNo || "TRF-" + Date.now().toString().slice(-6),
      new_balance: Number(newBalance || 0),
      notes: notes || "Transfer P2P S-Wallet",
      timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
    }
  });
}

/**
 * 5. NOTIFIKASI PENARIKAN DANA BANK (PAYOUT)
 */
export async function dispatchHermesWalletWithdrawal({
  amount,
  bankName = "BCA",
  accountNumber = "",
  accountHolder = "",
  fee = 0,
  refNo,
  remainingBalance = 0,
  status = "processing",
  user = {},
  tenantName = "Tijarah Merchant"
}) {
  const targetPhone = user.phone || user.whatsapp_owner || DEFAULT_TARGET_PHONE;

  return dispatchHermesEvent({
    event: "wallet_withdrawal",
    tenant: tenantName,
    target: targetPhone,
    data: {
      amount: Number(amount || 0),
      bank_name: bankName,
      account_number: accountNumber,
      account_holder: accountHolder,
      fee: Number(fee || 0),
      ref_no: refNo || "WD-" + Date.now().toString().slice(-6),
      remaining_balance: Number(remainingBalance || 0),
      status: status,
      timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
    }
  });
}

/**
 * 6. NOTIFIKASI Z-REPORT TUTUP HARI KASIR (OWNER & GM)
 */
export async function dispatchHermesZReport({
  branchName = "Cabang Utama",
  tenantName = "Tijarah Merchant",
  orders = 0,
  revenue = 0,
  tax = 0,
  cogs = 0,
  voids = 0,
  cashActual = 0,
  whatsappOwner = null,
  whatsappGm = null
}) {
  const targets = [whatsappOwner || DEFAULT_TARGET_PHONE];
  if (whatsappGm && whatsappGm !== whatsappOwner) {
    targets.push(whatsappGm);
  }

  return dispatchHermesEvent({
    event: "z_report",
    tenant: tenantName,
    branch: branchName,
    target: targets[0],
    targets,
    data: {
      orders: Number(orders || 0),
      omzet: Number(revenue || 0),
      net_sales: Number((revenue || 0) - (tax || 0)),
      cogs: Number(cogs || 0),
      voids: Number(voids || 0),
      cash_actual: Number(cashActual || 0),
      timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
    }
  });
}

/**
 * 7. NOTIFIKASI PERINGATAN PEMBATALAN NOTA (VOID ALERT)
 */
export async function dispatchHermesVoidAlert({
  orderCode = "NOTA",
  amount = 0,
  cashierName = "Kasir Bertugas",
  reason = "Koreksi pesanan",
  approvedBy = "General Manager",
  branchName = "Cabang Utama",
  tenantName = "Tijarah Merchant",
  whatsappOwner = null,
  whatsappGm = null
}) {
  const targets = [whatsappOwner || DEFAULT_TARGET_PHONE];
  if (whatsappGm && whatsappGm !== whatsappOwner) {
    targets.push(whatsappGm);
  }

  return dispatchHermesEvent({
    event: "void_alert",
    tenant: tenantName,
    branch: branchName,
    target: targets[0],
    targets,
    data: {
      order_code: orderCode,
      amount: Number(amount || 0),
      cashier_name: cashierName,
      approved_by: approvedBy,
      reason: reason,
      timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
    }
  });
}

/**
 * 8. NOTIFIKASI STATUS KEAMANAN 2FA & PIN TRANSAKSI
 */
export async function dispatchHermesSecurityAlert({
  type = "two_factor_alert",
  isActive = true,
  user = {},
  tenantName = "Tijarah Merchant"
}) {
  const targetPhone = user.phone || user.whatsapp_owner || DEFAULT_TARGET_PHONE;

  if (type === "two_factor_alert") {
    return dispatchHermesEvent({
      event: "two_factor_alert",
      tenant: tenantName,
      target: targetPhone,
      data: {
        is_active: Boolean(isActive),
        user_email: user.email || "Pemilik Akun",
        timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
      }
    });
  }

  if (type === "pin_changed") {
    return dispatchHermesEvent({
      event: "pin_changed",
      tenant: tenantName,
      target: targetPhone,
      data: {
        user_name: user.full_name || user.email || "Pengguna",
        timestamp: new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })
      }
    });
  }
}
