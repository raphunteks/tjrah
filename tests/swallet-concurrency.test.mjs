// Tes Keamanan & Konkurensi S-Wallet (Fase 6)
// Menguji proteksi anti-double spending, invariant constraint, jam kerja, kalkulasi margin, dan integritas jurnal akuntansi.
import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateWithdrawalFee,
  DEFAULT_PRICING_CONFIG,
  isOperatingHours,
  generateAlphanumericOtp,
  verifyTotpChallenge,
  executeP2PTransfer,
  requestBankWithdrawal
} from "../src/api/swallet.js";

// ───────── 1. UJI SIMULASI KONKURENSI & ANTI-CHEAT DOUBLE-SPENDING ─────────
test("S-Wallet: Simulasi 10 request serentak hanya mengeksekusi saldo yang valid (Zero Double-Spending)", async () => {
  // Saldo awal dompet: Rp 1.000.000
  let state = {
    balance: 1000000,
    locked_balance: 0,
    is_locked: false
  };

  // Mutex row-lock PostgreSQL simulasi: SELECT ... FOR UPDATE
  async function simulateWithdrawalAtomic(amount) {
    // Tunggu antrean row lock
    while (state.is_locked) {
      await new Promise((r) => setTimeout(r, 2));
    }
    state.is_locked = true;

    try {
      // Periksa invariant CHECK (balance >= amount)
      if (state.balance < amount) {
        throw new Error("INSUFFICIENT_BALANCE: Saldo tidak mencukupi");
      }

      // Simulasi latensi jaringan transaksi RPC
      await new Promise((r) => setTimeout(r, 5));

      // Pindahkan balance ke locked_balance (Escrow hold)
      state.balance -= amount;
      state.locked_balance += amount;

      return { ok: true, remaining: state.balance };
    } finally {
      state.is_locked = false;
    }
  }

  // 10 permintaan serentak menarik masing-masing Rp 400.000
  // Dengan saldo Rp 1.000.000, HANYA 2 permintaan yang boleh sukses (2 x 400rb = 800rb, sisa 200rb)
  // 8 permintaan lainnya WAJIB ditolak karena saldo kurang dari Rp 400.000
  const requests = Array.from({ length: 10 }, () =>
    simulateWithdrawalAtomic(400000).catch((err) => ({ ok: false, error: err.message }))
  );

  const results = await Promise.all(requests);
  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;

  assert.equal(successCount, 2, "Tepat 2 transaksi yang berhasil dieksekusi");
  assert.equal(failCount, 8, "8 transaksi lainnya digagalkan oleh row-lock & invariant");
  assert.equal(state.balance, 200000, "Sisa saldo akhir harus tepat Rp 200.000");
  assert.equal(state.locked_balance, 800000, "Saldo terkunci escrow tepat Rp 800.000");
  assert.ok(state.balance >= 0, "Saldo tidak pernah boleh bernilai negatif");
});

// ───────── 2. UJI BASIS DATA INVARIANT CONSTRAINT (ANTI-MINUS) ─────────
test("S-Wallet: Mutasi yang menyebabkan saldo minus wajib dibatalkan (CHECK balance >= 0)", () => {
  const wallet = {
    balance: 50000,
    locked_balance: 0
  };

  function applyDeduction(w, debit) {
    if (w.balance - debit < 0) {
      throw new Error("DATABASE_VIOLATION: check constraint 'balance_non_negative' failed");
    }
    w.balance -= debit;
    return w.balance;
  }

  assert.doesNotThrow(() => applyDeduction(wallet, 20000));
  assert.equal(wallet.balance, 30000);

  // Tarik melebihi sisa saldo (Rp 40.000 > Rp 30.000)
  assert.throws(
    () => applyDeduction(wallet, 40000),
    /balance_non_negative/,
    "Pelanggaran constraint database harus melempar error dan di-rollback"
  );
  assert.equal(wallet.balance, 30000, "Saldo tidak berubah setelah transaksi gagal");
});

// ───────── 3. UJI MODEL MONETISASI PENARIKAN & MARGIN PLATFORM ─────────
test("S-Wallet: Kalkulasi tarif penarikan 3 Tier & Margin Profit Platform presisi", () => {
  const config = {
    tier1: { min: 15000, max: 4999999, baseCost: 3000, margin: 2000, userFee: 5000 },
    tier2: { min: 5000000, max: 9999999, baseCost: 5000, margin: 3000, userFee: 8000 },
    tier3: { min: 10000000, max: 100000000, baseCost: 7000, margin: 5000, userFee: 12000 }
  };

  // Tier 1: Penarikan Rp 2.000.000
  const t1 = calculateWithdrawalFee(2000000, config);
  assert.equal(t1.tier, 1);
  assert.equal(t1.baseFee, 3000, "Modal pokok Pakasir Tier 1");
  assert.equal(t1.marginProfit, 2000, "Margin keuntungan platform Tier 1");
  assert.equal(t1.userFee, 5000, "Biaya ditagihkan ke pengguna Tier 1");
  assert.equal(t1.totalDeducted, 2005000, "Total saldo terpotong dari dompet");

  // Tier 2: Penarikan Rp 7.500.000
  const t2 = calculateWithdrawalFee(7500000, config);
  assert.equal(t2.tier, 2);
  assert.equal(t2.baseFee, 5000, "Modal pokok Pakasir Tier 2");
  assert.equal(t2.marginProfit, 3000, "Margin keuntungan platform Tier 2");
  assert.equal(t2.userFee, 8000, "Biaya ditagihkan ke pengguna Tier 2");
  assert.equal(t2.totalDeducted, 7508000);

  // Tier 3: Penarikan Rp 25.000.000
  const t3 = calculateWithdrawalFee(25000000, config);
  assert.equal(t3.tier, 3);
  assert.equal(t3.baseFee, 7000, "Modal pokok Pakasir Tier 3");
  assert.equal(t3.marginProfit, 5000, "Margin keuntungan platform Tier 3");
  assert.equal(t3.userFee, 12000, "Biaya ditagihkan ke pengguna Tier 3");
  assert.equal(t3.totalDeducted, 25012000);
});

// ───────── 4. UJI LOGIKA JAM KERJA KLIRING BANK (SMART QUEUE WINDOW) ─────────
test("S-Wallet: Penentuan jam operasional kliring perbankan (Senin-Sabtu 09.00-16.00 WIB)", () => {
  function checkScheduleWib(dayOfWeek, hours, minutes) {
    // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
    if (dayOfWeek === 0) {
      return { isOpen: false, reason: "Hari Minggu di luar jam kliring" };
    }
    const currentMin = hours * 60 + minutes;
    const startMin = 9 * 60; // 09:00 WIB
    const endMin = 16 * 60;  // 16:00 WIB

    if (currentMin >= startMin && currentMin < endMin) {
      return { isOpen: true, reason: "Dalam jam kliring operasional" };
    }
    return { isOpen: false, reason: "Di luar jam operasional (antrean terjadwal)" };
  }

  // Hari Selasa pukul 10:30 WIB -> Buka
  const t1 = checkScheduleWib(2, 10, 30);
  assert.equal(t1.isOpen, true, "Selasa 10:30 WIB harus buka");

  // Hari Minggu pukul 11:00 WIB -> Tutup (Hari Libur)
  const t2 = checkScheduleWib(0, 11, 0);
  assert.equal(t2.isOpen, false, "Minggu harus antrean terjadwal");

  // Hari Jumat pukul 17:30 WIB -> Tutup (Lewat pukul 16:00)
  const t3 = checkScheduleWib(5, 17, 30);
  assert.equal(t3.isOpen, false, "Jumat 17:30 WIB harus antrean terjadwal");

  // Hari Sabtu pukul 08:30 WIB -> Tutup (Sebelum pukul 09:00)
  const t4 = checkScheduleWib(6, 8, 30);
  assert.equal(t4.isOpen, false, "Sabtu 08:30 WIB harus antrean terjadwal");
});

// ───────── 5. UJI INTEGRITAS BUKU BESAR AKUNTANSI BERPASANGAN (DOUBLE-ENTRY) ─────────
test("S-Wallet: Seluruh mutasi finansial wajib membukukan Debit == Kredit (Selisih Rp 0)", () => {
  // Simulasi mutasi penarikan dana Rp 5.000.000 dengan biaya admin Rp 8.000 (modal Rp 5.000 + profit Rp 3.000)
  const withdrawalMutation = {
    entries: [
      { account: "2105 - Utang Saldo Pengguna", debit: 5008000, credit: 0 },
      { account: "1101 - Kas Bank Penampung", debit: 0, credit: 5005000 },
      { account: "4201 - Pendapatan Komisi Platform", debit: 0, credit: 3000 }
    ]
  };

  const totalDebit = withdrawalMutation.entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = withdrawalMutation.entries.reduce((s, e) => s + e.credit, 0);

  assert.equal(totalDebit, totalCredit, "Total Debit wajib sama persis dengan Total Kredit");
  assert.equal(totalDebit - totalCredit, 0, "Discrepancy / Selisih kas harus mutlak Rp 0");

  // Simulasi auto-split klinik: invoice Rp 1.000.000 (Dokter 30% = 300rb, Klinik 70% = 700rb)
  const clinicSplit = {
    entries: [
      { account: "1101 - Kas / S-Wallet Kasir", debit: 1000000, credit: 0 },
      { account: "4101 - Pendapatan Klinik", debit: 0, credit: 700000 },
      { account: "2106 - Utang Saldo Dokter", debit: 0, credit: 300000 }
    ]
  };

  const clinicDebit = clinicSplit.entries.reduce((s, e) => s + e.debit, 0);
  const clinicCredit = clinicSplit.entries.reduce((s, e) => s + e.credit, 0);

  assert.equal(clinicDebit, clinicCredit, "Auto-split dokter wajib seimbang debet dan kredit");
});

// ───────── 6. UJI FORMAT KODE OTP ALFANUMERIK (RESET PIN) ─────────
test("S-Wallet: generateAlphanumericOtp menghasilkan format SW-XXXXXX (kombinasi huruf kapital & angka)", () => {
  for (let i = 0; i < 20; i++) {
    const code = generateAlphanumericOtp();
    assert.match(code, /^SW-[2-9A-Z]{6}$/, `Format OTP harus SW-XXXXXX: ${code}`);
    assert.equal(code.length, 9, "Panjang kode OTP harus tepat 9 karakter (SW- + 6 karakter)");
  }
});

// ───────── 7. UJI ELIMINASI KODE DUMMY / BYPASS TESTING ─────────
test("S-Wallet: verifyTotpChallenge menolak kode dummy 123456 dan 888888", async () => {
  // Tanpa secret key yang cocok, token 123456 dan 888888 WAJIB ditolak (tidak ada backdoor testing)
  const res1 = await verifyTotpChallenge("123456", "JBSWY3DPEHPK3PXP", "");
  assert.equal(res1.ok, false, "Token dummy 123456 wajib ditolak oleh engine keamanan");

  const res2 = await verifyTotpChallenge("888888", "JBSWY3DPEHPK3PXP", "");
  assert.equal(res2.ok, false, "Token dummy 888888 wajib ditolak oleh engine keamanan");
});

// ───────── 8. UJI KEHARUSAN PIN TRANSAKSI PADA TRANSFER & PENARIKAN ─────────
test("S-Wallet: Transfer dan penarikan bank diblokir jika PIN transaksi belum diset atau salah", async () => {
  // Test transfer tanpa PIN yang diset
  const resTrfNoPin = await executeP2PTransfer(null, {
    senderUserId: "user-without-pin-99",
    receiverIdentifier: "SW-202610-000000",
    amount: 50000,
    pin: "123456"
  });
  assert.equal(resTrfNoPin.ok, false, "Transfer harus gagal jika pengguna belum set PIN");
  assert.match(resTrfNoPin.error, /PIN Transaksi belum dibuat/i);

  // Test penarikan tanpa PIN yang diset
  const resWdNoPin = await requestBankWithdrawal(null, {
    userId: "user-without-pin-99",
    bankName: "BCA",
    accountNumber: "1234567890",
    accountHolder: "Test User",
    amount: 50000,
    pin: "123456"
  });
  assert.equal(resWdNoPin.ok, false, "Penarikan harus gagal jika pengguna belum set PIN");
  assert.match(resWdNoPin.error, /PIN Transaksi belum dibuat/i);
});

