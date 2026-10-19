import { useState, useEffect } from "react";

export const DICTIONARY = {
  id: {
    // Header & Umum
    eyebrow: "Pusat Pengaturan Akun & Tata Kelola",
    langLabel: "Bahasa",
    saveSuccess: "Pembaruan Berhasil Disimpan",
    saveChanges: "Simpan Perubahan",
    saving: "Menyimpan...",
    openTab: "Buka Menu",
    currentTab: "Sedang Aktif",

    // Bento Nav Cards
    navProfileTitle: "Profil Pengguna",
    navProfileDesc: "Biodata diri, foto profil, nomor WhatsApp resmi, dan nomor rekening payroll pribadi.",
    navProfileBadge: "Biodata & Bank",

    navSecurityTitle: "Keamanan & 2FA",
    navSecurityDesc: "Autentikasi sandi, TOTP 2FA, PIN 6-digit S-Wallet, dan manajemen sesi perangkat aktif.",
    navSecurityBadge: "Proteksi Sandi & PIN",

    navAppearanceTitle: "Tampilan & Bahasa",
    navAppearanceDesc: "Pilihan Bahasa Indonesia / English, tema gelap/terang, dan suara operasional kasir.",
    navAppearanceBadge: "ID / EN · Tema",

    navNotificationsTitle: "Pusat Notifikasi",
    navNotificationsDesc: "Saluran pengiriman WhatsApp bot Hermes, In-App alert, dan jam hening malam hari.",
    navNotificationsBadge: "Hermes WA & Alert",

    navAccessTitle: "Hak Akses Matriks",
    navAccessDesc: "Transparansi 20 fitur RBAC dan pembatasan isolasi database PostgreSQL Row-Level Security.",
    navAccessBadge: "20 Fitur RBAC",

    navSubscriptionTitle: "Langganan & AI",
    navSubscriptionDesc: "Paket Starter/Growth/Enterprise, kuota pertanyaan AI (1 Tanya = 1 Kuota), dan faktur tagihan.",
    navSubscriptionBadge: "Paket & 250 AI",

    navReferralTitle: "Kode Referral",
    navReferralDesc: "Format TIJARAH-[NAMA]XXXX, komisi 1% masuk S-Wallet, dan diskon 10% untuk merchant baru.",
    navReferralBadge: "Komisi 1% S-Wallet",

    // Profil Page
    profileTitle: "Profil Saya",
    profileDesc: "Kelola data identitas diri, foto profil, kontak resmi, rekening payroll, dan penugasan organisasi.",
    photoTitle: "Foto Profil & Identitas Diri",
    photoDesc: "Format didukung: JPG, PNG, atau WebP (Maksimal 2 MB). Nilai default resmi adalah logo Tijarah.",
    uploadPhoto: "Unggah Foto Baru",
    resetPhoto: "Kembalikan ke Default",
    fullNameLabel: "Nama Lengkap Sesuai KTP",
    genderLabel: "Jenis Kelamin",
    male: "Laki-laki",
    female: "Perempuan",
    birthPlaceLabel: "Tempat Lahir",
    birthDateLabel: "Tanggal Lahir",
    addressLabel: "Alamat Domisili Lengkap",
    phoneLabel: "Nomor Handphone / WhatsApp Resmi",
    phoneDesc: "Digunakan untuk penerimaan notifikasi bot WhatsApp Hermes, alert persetujuan, dan slip gaji.",
    emailLabel: "Alamat Email Login",
    verifiedBadge: "Terverifikasi",
    roleLabel: "Peran & Tingkat Hierarki",
    branchLabel: "Cabang Penugasan Operasional",
    bankTitle: "Rekening Payroll Pribadi (Pencairan Gaji & Komisi)",
    bankDesc: "Rekening bank ini ditarik otomatis oleh sistem saat General Manager atau Owner memproses pencairan gaji bulanan dan komisi pada modul Penggajian (F14).",
    bankNameLabel: "Nama Bank Penampung",
    bankAccLabel: "Nomor Rekening Bank",
    bankHolderLabel: "Nama Pemilik Rekening (Atas Nama)",

    // Keamanan Page
    securityTitle: "Keamanan & Kredensial",
    securityDesc: "Ubah kata sandi, aktivasi TOTP 2FA, kelola PIN transaksi S-Wallet, dan pantau sesi perangkat aktif.",
    passwordTitle: "Autentikasi Kata Sandi",
    oldPasswordLabel: "Kata Sandi Saat Ini",
    newPasswordLabel: "Kata Sandi Baru",
    confirmPasswordLabel: "Konfirmasi Kata Sandi Baru",
    showPassword: "Tampilkan karakter kata sandi",
    updatePassword: "Perbarui Kata Sandi",
    strengthLabel: "Kekuatan Sandi:",
    twoFactorTitle: "Autentikasi Dua Faktor (TOTP 2FA)",
    twoFactorSub: "Perlindungan Akun Tingkat Tinggi (RFC 6238 TOTP)",
    twoFactorDesc: "Saat 2FA aktif, Anda wajib memasukkan 6 digit kode OTP dari Google Authenticator, Microsoft Authenticator, atau Authy setiap kali melakukan login atau otorisasi finansial.",
    twoFactorActiveBadge: "2FA Aktif Terlindungi",
    twoFactorInactiveBadge: "2FA Nonaktif",
    enable2Fa: "Aktifkan 2FA Sekarang",
    disable2Fa: "Nonaktifkan 2FA",
    backupCodesBtn: "Kode Cadangan",
    pinTitle: "PIN Transaksi 6-Digit (Persiapan S-Wallet & Kasir POS)",
    pinDesc: "PIN Transaksi digunakan untuk otorisasi cepat penarikan dana saldo S-Wallet ke rekening bank, dan otorisasi persetujuan pembatalan nota (Void) di mesin kasir POS tanpa harus memasukkan kata sandi penuh.",
    pinStatusLabel: "Status PIN Transaksi:",
    pinActiveBadge: "PIN Aktif Terkonfigurasi",
    pinInactiveBadge: "PIN Belum Dibuat",
    pinNew: "PIN 6-Digit Baru",
    pinConfirm: "Konfirmasi PIN 6-Digit",
    savePin: "Simpan PIN Transaksi",
    sessionTitle: "Daftar Sesi Perangkat Aktif",
    forceLogoutAll: "Keluarkan dari Semua Perangkat Lain",
    currentDeviceBadge: "Perangkat Ini",
    auditTitle: "Log Riwayat Keamanan Akun (20 Kejadian Terakhir)",

    // Tampilan Page
    appearanceTitle: "Tampilan & Bahasa",
    appearanceDesc: "Personalisasi bahasa antarmuka, tema warna, skala teks, dan umpan balik suara kasir operasional.",
    langSectionTitle: "Pilihan Bahasa Antarmuka (Language & Localization)",
    langSectionDesc: "Pilih bahasa utama yang digunakan pada seluruh navigasi sistem, label tombol kasir POS, dan istilah dokumen resmi.",
    themeTitle: "Mode Tema Antarmuka (Theme Mode)",
    lightTheme: "Mode Terang (Light)",
    darkTheme: "Mode Gelap (Dark)",
    timezoneTitle: "Zona Waktu Operasional (Timezone)",
    timezoneDesc: "Pilih zona waktu baku untuk penanggalan transaksi, absensi staf, dan pembukuan toko. Standar default platform adalah WITA (Asia/Makassar).",
    audioTitle: "Umpan Balik Suara Operasional POS (Audio Feedback)",
    audioBeepTitle: "Bunyi Beep Scanner Barcode",
    audioBeepDesc: "Mengeluarkan suara beep tajam saat scanner mendeteksi barcode produk.",
    audioChimeTitle: "Bunyi Lonceng Sukses Pembayaran (Chime)",
    audioChimeDesc: "Mengeluarkan nada melodi akor saat pembayaran transaksi berhasil disetujui.",
    testSound: "Uji Suara",

    // Notifikasi Page
    notifTitle: "Pusat Notifikasi",
    notifDesc: "Atur preferensi kanal pengiriman alert melalui In-App, bot WhatsApp Hermes, dan Email resmi.",
    channelsTitle: "Saluran Pengiriman Resmi",
    matrixTitle: "Matriks Preferensi Kategori Notifikasi",
    dndTitle: "Jam Hening (Do Not Disturb)",
    dndLabel: "Aktifkan Penjeda Notifikasi Malam Hari",
    dndDesc: "Pesan WhatsApp non-kritis (laporan harian dan info stok) akan dijeda otomatis agar tidak mengganggu waktu istirahat Anda.",
    dndStart: "Mulai Hening Pukul:",
    dndEnd: "Selesai Hening Pukul:",

    // Akses Page
    accessTitle: "Hak Akses Saya",
    accessDesc: "Daftar transparan 20 fitur sistem berdasarkan peran akun Anda. Seluruh aturan wewenang ditegakkan langsung oleh Row-Level Security di database PostgreSQL.",
    accessMatrixTitle: "Matriks 20 Fitur Tijarah OS",

    // Langganan Page
    subscriptionTitle: "Langganan & Kuota AI",
    subscriptionDesc: "Kelola status paket langganan merchant, masa aktif, kuota pertanyaan AI (1 Tanya = 1 Kuota), dan faktur tagihan.",

    // Stok & Gudang (Multi-UoM, Mutasi, Opname, Waste)
    stockTitle: "Stok & Gudang",
    stockDesc: "Kelola stok bahan baku dengan dukungan Multi-UoM (Konversi Satuan Beli Kemasan ke Satuan Dasar Resep). Terintegrasi otomatis ke HPP Menu, Resep & BOM, dan Pemotongan Kasir POS.",
    stockTabLevel: "Level Stok",
    stockTabMovements: "Riwayat Mutasi",
    stockTabOpname: "Stock Opname",
    stockTabWaste: "Susut & Waste",
    stockAddBtn: "+ Tambah Bahan",
    stockBulkImportBtn: "Bulk Import (.xlsx)",
    stockLocation: "Lokasi Cabang",
    stockAllLocations: "Semua Lokasi",
    stockSearchPlaceholder: "Cari nama bahan baku atau SKU...",
    stockUnitBase: "Satuan Dasar Resep (Terkecil)",
    stockUnitWholesale: "Satuan Beli Kulakan",
    stockConversionRate: "Faktor Konversi",
    stockMinThreshold: "Batas Minimum (ROP)",
    stockHppCalculated: "HPP Dasar Terhitung",
    stockSaveSuccess: "Bahan Baku Berhasil Disimpan",
    stockImportSuccess: "Bahan Baku Berhasil Diimpor",

    // Aksi & Status Umum Seluruh RBAC
    actionFilter: "Filter",
    actionExport: "Ekspor Excel",
    actionDownloadTemplate: "Unduh Templat (.xlsx)",
    actionUploadFile: "Unggah Berkas (.xlsx & .csv)",
    actionCancel: "Batal",
    actionSave: "Simpan",
    actionDelete: "Hapus",
    actionEdit: "Ubah",
    actionSearch: "Cari...",
    statusActive: "Aktif",
    statusInactive: "Nonaktif",
    statusPending: "Menunggu Otorisasi",
    statusApproved: "Disetujui",
    statusRejected: "Ditolak",
    statusDraft: "Draf",

    // Notifikasi & Alert Testing
    notifTestInApp: "Uji In-App Alert",
    notifTestWhatsapp: "Uji WhatsApp Hermes",
    notifTestEmail: "Uji Email Resmi",
    notifTestPush: "Uji Browser Push",
    notifChannelInApp: "Pemberitahuan In-App",
    notifChannelWhatsapp: "Bot WhatsApp Hermes",
    notifChannelEmail: "Email Resmi",
    notifChannelPush: "Notifikasi Peramban",
    notifRoleMatrixTitle: "Matriks Notifikasi Peran",

    // Referral Page
    referralTitle: "Program Referral Merchant",
    referralDesc: "Ajak pebisnis lain bergabung ke ekosistem Tijarah dan dapatkan komisi recurring 1% setiap bulan langsung ke saldo S-Wallet.",
    referralCodeCardTitle: "Kode Referral Resmi Anda",
    referralLinkCardTitle: "Tautan Undangan Merchant",
    copyCodeBtn: "Salin Kode",
    copyLinkBtn: "Salin Tautan",
    shareWaBtn: "Kirim ke WhatsApp",
    payoutToWalletBtn: "Tarik Saldo Komisi ke S-Wallet",
    historyTableTitle: "Riwayat Pengguna Kode Referral Anda",
    noReferralsYet: "Belum ada merchant yang mendaftar menggunakan kode referral Anda."
  },

  en: {
    // Header & General
    eyebrow: "Account Settings & Governance Hub",
    langLabel: "Language",
    saveSuccess: "Updates Successfully Saved",
    saveChanges: "Save Changes",
    saving: "Saving...",
    openTab: "Open Menu",
    currentTab: "Active Now",

    // Bento Nav Cards
    navProfileTitle: "User Profile",
    navProfileDesc: "Personal biodata, profile picture, official WhatsApp, and payroll bank account.",
    navProfileBadge: "Profile & Bank",

    navSecurityTitle: "Security & 2FA",
    navSecurityDesc: "Password authentication, TOTP 2FA, 6-digit S-Wallet PIN, and active device sessions.",
    navSecurityBadge: "Password & PIN",

    navAppearanceTitle: "Display & Language",
    navAppearanceDesc: "Switch Indonesian / English language, light/dark themes, and POS audio feedback.",
    navAppearanceBadge: "ID / EN · Themes",

    navNotificationsTitle: "Notification Center",
    navNotificationsDesc: "Delivery channels for Hermes WhatsApp bot, In-App alerts, and nighttime quiet hours.",
    navNotificationsBadge: "Hermes WA & Alerts",

    navAccessTitle: "RBAC Access Matrix",
    navAccessDesc: "Transparent 20-feature RBAC matrix and PostgreSQL Row-Level Security database isolation.",
    navAccessBadge: "20 RBAC Features",

    navSubscriptionTitle: "Subscription & AI",
    navSubscriptionDesc: "Starter/Growth/Enterprise plans, AI query quota (1 Query = 1 Credit), and billing invoices.",
    navSubscriptionBadge: "Plans & 250 AI",

    navReferralTitle: "Referral Program",
    navReferralDesc: "Format TIJARAH-[NAME]XXXX, 1% recurring S-Wallet commission, and 10% discount for new merchants.",
    navReferralBadge: "1% S-Wallet Payout",

    // Profil Page
    profileTitle: "My Profile",
    profileDesc: "Manage personal identity, avatar image, contact details, payroll account, and organizational role.",
    photoTitle: "Profile Picture & Personal Identity",
    photoDesc: "Supported formats: JPG, PNG, or WebP (Max 2 MB). Default is official Tijarah logo.",
    uploadPhoto: "Upload New Photo",
    resetPhoto: "Reset to Default",
    fullNameLabel: "Full Name (as on ID Card)",
    genderLabel: "Gender",
    male: "Male",
    female: "Female",
    birthPlaceLabel: "Place of Birth",
    birthDateLabel: "Date of Birth",
    addressLabel: "Complete Residential Address",
    phoneLabel: "Official Mobile / WhatsApp Number",
    phoneDesc: "Used for receiving automated Hermes WhatsApp alerts, approval notices, and digital payslips.",
    emailLabel: "Login Email Address",
    verifiedBadge: "Verified",
    roleLabel: "Role & Hierarchy Level",
    branchLabel: "Operational Branch Assignment",
    bankTitle: "Personal Payroll Bank Account",
    bankDesc: "This bank account is automatically used by General Managers and Owners when processing monthly salary transfers and commissions in the Payroll module (F14).",
    bankNameLabel: "Receiving Bank Name",
    bankAccLabel: "Bank Account Number",
    bankHolderLabel: "Account Holder Name",

    // Keamanan Page
    securityTitle: "Security & Credentials",
    securityDesc: "Update password, activate TOTP 2FA, manage 6-digit S-Wallet transaction PIN, and monitor active device sessions.",
    passwordTitle: "Password Authentication",
    oldPasswordLabel: "Current Password",
    newPasswordLabel: "New Password",
    confirmPasswordLabel: "Confirm New Password",
    showPassword: "Show password characters",
    updatePassword: "Update Password",
    strengthLabel: "Password Strength:",
    twoFactorTitle: "Two-Factor Authentication (TOTP 2FA)",
    twoFactorSub: "High-Grade Account Security (RFC 6238 TOTP)",
    twoFactorDesc: "When 2FA is active, you must enter a 6-digit OTP code from Google Authenticator, Microsoft Authenticator, or Authy each time you log in or authorize financial transactions.",
    twoFactorActiveBadge: "2FA Active & Protected",
    twoFactorInactiveBadge: "2FA Inactive",
    enable2Fa: "Enable 2FA Now",
    disable2Fa: "Disable 2FA",
    backupCodesBtn: "Backup Codes",
    pinTitle: "6-Digit Transaction PIN (S-Wallet & POS Cashier Ready)",
    pinDesc: "The 6-digit numeric PIN is used for rapid authorization of S-Wallet balance withdrawals (Payouts) to bank accounts and POS bill void approvals without entering full passwords.",
    pinStatusLabel: "Transaction PIN Status:",
    pinActiveBadge: "PIN Active & Configured",
    pinInactiveBadge: "PIN Not Created Yet",
    pinNew: "New 6-Digit PIN",
    pinConfirm: "Confirm 6-Digit PIN",
    savePin: "Save Transaction PIN",
    sessionTitle: "Active Device Sessions",
    forceLogoutAll: "Log Out All Other Devices",
    currentDeviceBadge: "This Device",
    auditTitle: "Security Event Log (Last 20 Events)",

    // Tampilan Page
    appearanceTitle: "Display & Language",
    appearanceDesc: "Personalize interface language, color themes, font scaling, and operational POS cashier sounds.",
    langSectionTitle: "Interface Language Selection (Language & Localization)",
    langSectionDesc: "Choose the primary language used across navigation menus, POS button labels, and official accounting documents.",
    themeTitle: "Theme Mode",
    lightTheme: "Light Mode",
    darkTheme: "Dark Mode",
    timezoneTitle: "Operational Timezone",
    timezoneDesc: "Select the operational timezone for store transactions, staff attendance, and bookkeeping. Default platform standard is WITA (Asia/Makassar).",
    audioTitle: "Operational POS Audio Feedback",
    audioBeepTitle: "Barcode Scanner Beep Sound",
    audioBeepDesc: "Emits a sharp beep tone when barcode scanners detect product codes.",
    audioChimeTitle: "Payment Success Chime Sound",
    audioChimeDesc: "Plays a melodious chord chime when customer payment transactions are approved.",
    testSound: "Test Audio",

    // Notifikasi Page
    notifTitle: "Notification Center",
    notifDesc: "Configure delivery channels via In-App banners, Hermes WhatsApp bot, and official email receipts.",
    channelsTitle: "Official Delivery Channels",
    matrixTitle: "Notification Categories Matrix",
    dndTitle: "Quiet Hours (Do Not Disturb)",
    dndLabel: "Enable Nighttime Notification Pausing",
    dndDesc: "Non-critical WhatsApp alerts (daily reports and low stock notices) will be automatically paused to prevent disturbance during rest hours.",
    dndStart: "Quiet Start Time:",
    dndEnd: "Quiet End Time:",

    // Akses Page
    accessTitle: "My Access Rights",
    accessDesc: "Transparent list of the 20 system features based on your account role. All permissions are strictly enforced by PostgreSQL Row-Level Security at the database layer.",
    accessMatrixTitle: "Tijarah OS 20-Feature RBAC Matrix",

    // Langganan Page
    subscriptionTitle: "Subscription & AI Credits",
    subscriptionDesc: "Manage merchant subscription plans, active period, AI query quotas (1 Query = 1 Credit), and billing invoices.",

    // Stok & Gudang (Multi-UoM, Mutasi, Opname, Waste)
    stockTitle: "Stock & Inventory",
    stockDesc: "Manage raw ingredients with Multi-UoM conversion (Purchase packaging unit to base recipe unit). Auto-integrated with Menu COGS, Recipe & BOM, and POS Cashier deductions.",
    stockTabLevel: "Stock Level",
    stockTabMovements: "Stock Movements",
    stockTabOpname: "Stock Opname",
    stockTabWaste: "Waste & Shrinkage",
    stockAddBtn: "+ Add Ingredient",
    stockBulkImportBtn: "Bulk Import (.xlsx)",
    stockLocation: "Branch Location",
    stockAllLocations: "All Locations",
    stockSearchPlaceholder: "Search ingredient name or SKU...",
    stockUnitBase: "Base Recipe Unit (Smallest)",
    stockUnitWholesale: "Purchase Packaging Unit",
    stockConversionRate: "Conversion Ratio",
    stockMinThreshold: "Reorder Point (ROP)",
    stockHppCalculated: "Calculated Base Cost",
    stockSaveSuccess: "Raw Material Successfully Saved",
    stockImportSuccess: "Raw Materials Successfully Imported",

    // General Actions & Status Across RBAC
    actionFilter: "Filter",
    actionExport: "Export Excel",
    actionDownloadTemplate: "Download Template (.xlsx)",
    actionUploadFile: "Upload File (.xlsx & .csv)",
    actionCancel: "Cancel",
    actionSave: "Save",
    actionDelete: "Delete",
    actionEdit: "Edit",
    actionSearch: "Search...",
    statusActive: "Active",
    statusInactive: "Inactive",
    statusPending: "Pending Approval",
    statusApproved: "Approved",
    statusRejected: "Rejected",
    statusDraft: "Draft",

    // Notifications & Alert Testing
    notifTestInApp: "Test In-App Alert",
    notifTestWhatsapp: "Test Hermes WhatsApp",
    notifTestEmail: "Test Official Email",
    notifTestPush: "Test Browser Push",
    notifChannelInApp: "In-App Notifications",
    notifChannelWhatsapp: "Hermes WhatsApp Bot",
    notifChannelEmail: "Official Email",
    notifChannelPush: "Browser Notifications",
    notifRoleMatrixTitle: "Role Notification Matrix",

    // Referral Page
    referralTitle: "Merchant Referral Program",
    referralDesc: "Invite fellow entrepreneurs to the Tijarah ecosystem and earn a 1% recurring monthly commission directly into your S-Wallet balance.",
    referralCodeCardTitle: "Your Official Referral Code",
    referralLinkCardTitle: "Merchant Invitation Link",
    copyCodeBtn: "Copy Code",
    copyLinkBtn: "Copy Link",
    shareWaBtn: "Send to WhatsApp",
    payoutToWalletBtn: "Withdraw Commission to S-Wallet",
    historyTableTitle: "Referral Users History Log",
    noReferralsYet: "No merchants have registered using your referral code yet."
  }
};

// Master Kamus Terjemahan Dashboard Menyeluruh (Bahasa Indonesia -> English)
export const MASTER_TRANSLATIONS = {
  // Phase & Feature Eyebrows
  "Fase 2 · Manajemen Cuti & Izin Kerja": "Phase 2 · Employee Leave & Permission Management",
  "Fase 2 · Manajemen Cuti &amp; Izin Kerja": "Phase 2 · Employee Leave & Permission Management",
  "Fitur 13 · Presensi Kamera & GPS": "Feature 13 · Camera & GPS Attendance",
  "Fitur 13 · Presensi Kamera &amp; GPS": "Feature 13 · Camera & GPS Attendance",
  "Fitur 13 · Direktori & Penugasan Staf": "Feature 13 · Staff Directory & Assignments",
  "Fitur 13 · Direktori &amp; Penugasan Staf": "Feature 13 · Staff Directory & Assignments",
  "Fitur 14 · Penggajian & Slip Gaji": "Feature 14 · Payroll & Digital Payslips",
  "Fitur 14 · Penggajian &amp; Slip Gaji": "Feature 14 · Payroll & Digital Payslips",
  "Fitur 15 · Pengetahuan & SOP": "Feature 15 · Knowledge Base & SOP",
  "Fitur 15 · Pengetahuan &amp; SOP": "Feature 15 · Knowledge Base & SOP",
  "Fitur 16 · Otorisasi & Persetujuan": "Feature 16 · Authorization & Approvals",
  "Fitur 16 · Otorisasi &amp; Persetujuan": "Feature 16 · Authorization & Approvals",
  "Fitur 17 · Laporan SDM & HRIS": "Feature 17 · HR Reports & Workforce Analytics",
  "Fitur 17 · Laporan SDM &amp; HRIS": "Feature 17 · HR Reports & Workforce Analytics",

  // Page Titles
  "Cuti & Izin Karyawan": "Employee Leave & Permissions",
  "Cuti &amp; Izin Karyawan": "Employee Leave & Permissions",
  "Absensi & Verifikasi Wajah": "Attendance & Face Verification",
  "Absensi &amp; Verifikasi Wajah": "Attendance & Face Verification",
  "Kelola Kasir & Penugasan Cabang": "Manage Cashiers & Branch Assignments",
  "Kelola Kasir &amp; Penugasan Cabang": "Manage Cashiers & Branch Assignments",
  "Jadwal Shift Kasir": "Cashier Shift Schedules",
  "Direktori Kasir & Staf": "Cashier & Staff Directory",
  "Direktori Kasir &amp; Staf": "Cashier & Staff Directory",
  "Penggajian Karyawan": "Employee Payroll",
  "Slip Gaji Saya": "My Payslip",
  "Jadwal & Tukar Shift": "Schedule & Swap Shift",
  "Jadwal &amp; Tukar Shift": "Schedule & Swap Shift",
  "Pengetahuan & SOP": "Knowledge & SOP",
  "Pengetahuan &amp; SOP": "Knowledge & SOP",
  "Pengetahuan & SOP Kerja": "Knowledge Base & Work SOP",
  "Pengetahuan &amp; SOP Kerja": "Knowledge Base & Work SOP",
  "Persetujuan": "Approvals & Authorizations",
  "Persetujuan (Approval)": "Approvals & Authorizations",
  "Laporan SDM": "HR & Workforce Reports",
  "Laporan SDM & HRIS": "HR Reports & HRIS",
  "Pusat Otorisasi & Persetujuan": "Authorization & Approval Center",

  // Page Descriptions
  "Pusat administrasi perizinan kerja, sinkronisasi buku saldo cuti tahunan, dan kalender cuti lintas cabang terpadu sistem roster.": "Work permit administration center, annual leave balance book sync, and integrated multi-branch roster leave calendar.",
  "Presensi valid menggunakan kamera live dengan stempel digital anti-rekayasa dan validasi radius geofencing per cabang.": "Valid attendance using live camera with anti-tamper digital stamp and per-branch geofencing radius validation.",
  "Alokasi penugasan jadwal kerja kasir & staf aktif gerai": "Work schedule allocation for active outlet cashiers and staff",
  "Alokasi penugasan jadwal kerja kasir &amp; staf aktif gerai": "Work schedule allocation for active outlet cashiers and staff",
  "Direktori kasir, penugasan cabang tunggal, dan monitoring status presensi operasional": "Cashier directory, single-branch assignment, and operational attendance monitoring",
  "Direktori kasir, penugasan cabang tunggal guna menjaga integritas laci kasir POS.": "Cashier directory and single-branch assignment to maintain POS cash drawer integrity.",
  "Papan pertukaran jadwal antar staf dan persetujuan manajer.": "Staff schedule swap board and manager approvals.",
  "Kalkulasi gaji pokok, uang lembur, komisi, potongan absensi/PPh21, dan cetak slip.": "Calculation of base salary, overtime, commissions, attendance/tax deductions, and payslips.",
  "Dokumentasi panduan operasional standar dan materi orientasi staf.": "Standard operating procedure guidelines and staff orientation materials.",
  "Daftar pengajuan perizinan, reimbursement, penyesuaian stok, dan otorisasi GM/Owner.": "Pending requests for permits, reimbursements, stock adjustments, and GM/Owner authorizations.",
  "Rekap tingkat kehadiran, keterlambatan, cuti, dan produktivitas karyawan.": "Summary of attendance rates, late arrivals, leaves, and staff productivity.",

  // Action Buttons & Links
  "+ Ajukan Permohonan Cuti / Izin": "+ Submit Leave / Permission Request",
  "Ajukan Permohonan Cuti / Izin": "Submit Leave / Permission Request",
  "+ Tambah Jadwal Shift": "+ Add Shift Schedule",
  "+ Tambah jadwal": "+ Add Schedule",
  "Auto-Rolling Shift (1-Click)": "Auto-Rolling Shift (1-Click)",
  "Auto-Rolling Shift Kasir & Staf (1-Click Roster)": "Auto-Rolling Cashier & Staff Shift (1-Click Roster)",
  "Undang Kasir Baru": "Invite New Cashier",
  "Ambil Foto & Absen Masuk": "Take Photo & Clock In",
  "Ambil Foto &amp; Absen Masuk": "Take Photo & Clock In",
  "Ambil Foto & Absen Pulang": "Take Photo & Clock Out",
  "Ambil Foto &amp; Absen Pulang": "Take Photo & Clock Out",
  "Nyalakan Kamera Depan": "Turn on Front Camera",
  "Tutup Kamera": "Turn off Camera",
  "Kirim Undangan Kasir": "Send Cashier Invitation",
  "Kirim Undangan": "Send Invitation",
  "Simpan Perubahan": "Save Changes",
  "Simpan Jadwal": "Save Schedule",
  "Simpan": "Save",
  "Batal": "Cancel",
  "Tutup": "Close",
  "Hapus": "Delete",
  "Ubah": "Edit",
  "Lihat": "View",
  "Coba lagi": "Retry",
  "Salin": "Copy",
  "Kirim via WhatsApp": "Send via WhatsApp",
  "Terapkan Auto-Rolling (1-Click)": "Apply Auto-Rolling (1-Click)",
  "Roster": "Roster",
  "Daftar Harian": "Daily List",
  "Ringkasan Roster": "Roster Summary",
  "Ringkasan Durasi": "Duration Summary",

  // Stat Card Titles & Descriptions (Leave / Cuti)
  "Menunggu Otorisasi": "Awaiting Authorization",
  "MENUNGGU OTORISASI": "AWAITING AUTHORIZATION",
  "Permohonan butuh persetujuan": "Requests requiring approval",
  "Disetujui Bulan Ini": "Approved This Month",
  "DISETUJUI BULAN INI": "APPROVED THIS MONTH",
  "Total izin disahkan GM/Owner": "Total leaves approved by GM/Owner",
  "Sedang Cuti Hari Ini": "On Leave Today",
  "SEDANG CUTI HARI INI": "ON LEAVE TODAY",
  "Staf izin hari berjalan": "Staff on leave today",
  "Saldo Cuti Habis": "Zero Leave Balance",
  "SALDO CUTI HABIS": "ZERO LEAVE BALANCE",
  "Staf dengan sisa saldo 0": "Staff with 0 remaining balance",
  "Kasir dengan sisa kuota 0 hari": "Cashiers with 0 days quota left",

  // Stat Cards (Presensi & SDM)
  "Total Hadir Hari Ini": "Total Present Today",
  "Tepat Waktu": "On Time",
  "Terlambat": "Late Arrivals",
  "Izin / Cuti": "On Leave",
  "Alpha / Tanpa Keterangan": "Absent / Unexcused",
  "Presensi Hari Ini": "Today's Attendance",
  "Rasio Kehadiran": "Attendance Ratio",

  // Navigation Subtabs
  "Permohonan Cuti": "Leave Requests",
  "Buku Saldo Cuti": "Leave Balances",
  "Kalender Cuti": "Leave Calendar",
  "Antrean Pengajuan": "Request Queue",
  "Buku Saldo Cuti Staf": "Staff Leave Balance Book",
  "Kalender Cuti Lintas Cabang": "Cross-Branch Leave Calendar",
  "Riwayat Absensi Kasir": "Cashier Attendance History",
  "Absen Masuk Kamera": "Camera Clock-In",
  "Absen Pulang Kamera": "Camera Clock-Out",
  "Catatan Presensi (Opsional)": "Attendance Notes (Optional)",
  "Jadwal Kerja Hari Ini:": "Today's Work Schedule:",

  // Table Columns
  "Nama Kasir / Staf": "Cashier / Staff Name",
  "Nama Karyawan": "Employee Name",
  "Cabang Penugasan": "Assigned Branch",
  "Durasi & Rentang Roster": "Roster Duration & Range",
  "Durasi &amp; Rentang Roster": "Roster Duration & Range",
  "Pola Jam Kerja Shift": "Shift Working Hours Pattern",
  "Shift Hari Ini & Besok": "Today & Tomorrow Shift",
  "Shift Hari Ini &amp; Besok": "Today & Tomorrow Shift",
  "Status Roster": "Roster Status",
  "Status Durasi Jadwal": "Schedule Duration Status",
  "Aksi": "Action",
  "Waktu Masuk": "Clock-In Time",
  "Waktu Keluar": "Clock-Out Time",
  "Durasi Kerja": "Work Duration",
  "Jarak dari Cabang": "Distance to Branch",
  "Foto": "Photo",
  "Tanggal": "Date",
  "Hari": "Day",
  "Jam Shift": "Shift Hours",
  "Jam Shift Kerja": "Shift Working Hours",
  "Toleransi & Auto-Out": "Tolerance & Auto-Out",
  "Toleransi &amp; Auto-Out": "Tolerance & Auto-Out",
  "Status Hari": "Day Status",
  "Kategori Cuti": "Leave Category",
  "Periode Tanggal": "Date Period",
  "Durasi": "Duration",
  "Alasan": "Reason",
  "Status": "Status",

  // Categories of Leave
  "Cuti Tahunan": "Annual Leave",
  "Izin Pribadi": "Personal Permission",
  "Sakit": "Sick Leave",
  "Cuti Bersalin (Melahirkan)": "Maternity Leave",
  "Izin Keterlambatan Hadir": "Late Arrival Permission",
  "Izin Pulang Lebih Cepat": "Early Departure Permission",
  "Dinas Luar / Penugasan Khusus": "Out-of-Office Assignment",
  "Cuti Tanpa Upah (Unpaid Leave)": "Unpaid Leave",

  // Status Badges
  "Menunggu Otorisasi GM": "Awaiting GM Authorization",
  "Disetujui": "Approved",
  "Ditolak": "Rejected",
  "Dibatalkan": "Cancelled",
  "Aktif · Berjalan": "Active · In Progress",
  "Akan Datang": "Upcoming",
  "Selesai / Terlewat": "Completed / Expired",
  "Aktif (Libur Roster)": "Active (Roster Day Off)",
  "Libur Roster": "Roster Day Off",
  "Hari Ini": "Today",
  "Besok": "Tomorrow",
  "Kemarin": "Yesterday",
  "Libur": "Day Off",
  "Belum Mulai": "Not Started",
  "Tepat waktu": "On time",
  "Masuk Shift": "On Duty",
  "Terjadwal Mendatang": "Upcoming Schedule",

  // Leave Management Specifics
  "Kategori": "Category",
  "Staf & Cabang": "Staff & Branch",
  "Staf &amp; Cabang": "Staff & Branch",
  "Dokumen Bukti": "Attachment",
  "Lihat Dokumen": "View Document",
  "Detail": "Detail",
  "Evaluasi": "Evaluate",
  "Sesuaikan Memo": "Adjust Balance",
  "Daftar Permohonan Cuti & Izin": "Leave & Permission Requests",
  "Daftar Permohonan Cuti &amp; Izin": "Leave & Permission Requests",
  "Buku Saldo Cuti Staf": "Staff Leave Balance Book",
  "Pembaruan otomatis 12 hari/tahun setiap 1 Januari & penyesuaian manual memo": "Automatic renewal of 12 days/year every Jan 1st & manual memo adjustment",
  "Pembaruan otomatis 12 hari/tahun setiap 1 Januari &amp; penyesuaian manual memo": "Automatic renewal of 12 days/year every Jan 1st & manual memo adjustment",
  "Kalender Cuti Lintas Cabang": "Cross-Branch Leave Calendar",
  "Visualisasi jadwal cuti aktif seluruh gerai outlet untuk mencegah kekosongan shift": "Visualization of active leave schedules across all outlets to prevent shift shortages",
  "Nama Staf Kasir": "Cashier Staff Name",
  "Cabang": "Branch",
  "Kuota Tahunan": "Annual Quota",
  "Cuti Digunakan": "Leave Used",
  "Pending GM": "Pending GM",
  "Sisa Saldo Aktif": "Remaining Active Balance",
  "Shift Roster Terblokir": "Roster Shift Blocked",
  "Belum ada permohonan cuti terdaftar": "No leave requests registered yet",
  "Gunakan tombol \"+ Ajukan Permohonan Cuti / Izin\" untuk membuat permohonan baru.": "Use the \"+ Submit Leave / Permission Request\" button to create a new request.",
  "Tidak ada cuti yang disetujui pada kalender ini": "No approved leave on this calendar",
  "Formulir Permohonan Cuti & Izin Resmi": "Official Leave & Permission Request Form",
  "Formulir Permohonan Cuti &amp; Izin Resmi": "Official Leave & Permission Request Form",
  "Kasir / Staf Pemohon": "Requesting Cashier / Staff",
  "Kategori Cuti / Izin": "Leave / Permission Category",
  "Tanggal Mulai": "Start Date",
  "Tanggal Selesai": "End Date",
  "Jumlah Hari Kalender": "Calendar Days Count",
  "Alasan Permohonan Cuti": "Reason for Leave",
  "Kirim Permohonan": "Submit Request",
  "Kirim Pengajuan Cuti": "Submit Leave Request",
  "Total Durasi:": "Total Duration:",
  "Hari Kerja": "Working Days",
  "Evaluasi Permohonan Cuti": "Evaluate Leave Request",
  "Buka Dokumen Bukti": "Open Supporting Document",
  "Tolak Permohonan": "Reject Request",
  "Setujui Cuti": "Approve Leave",
  "Penyesuaian Manual Saldo Cuti": "Manual Leave Balance Adjustment",
  "Simpan Penyesuaian": "Save Adjustment",
  "Aturan Mesin Kuota:": "Quota Engine Rules:",
  "Kuota tahunan direset otomatis menjadi 12 hari kerja setiap tanggal 1 Januari. Cuti Bersalin (ML) dan Dinas Luar (DL) tidak memotong kuota reguler tahunan.": "Annual quota is automatically reset to 12 work days every January 1st. Maternity Leave (ML) and Out-of-Office Assignments (DL) do not deduct from regular annual quota.",

  // System States & Errors
  "Gagal memuat.": "Failed to load.",
  "Waktu tunggu server melebihi batas (8s). Menampilkan data lokal terakhir.": "Server request timed out. Showing last available local data.",
  "Waktu tunggu server melebihi batas. Menampilkan data lokal terakhir.": "Server request timed out. Showing last available local data.",
  "Belum ada data": "No data available",
  "Belum ada jadwal shift": "No shift schedules yet",
  "Memuat data...": "Loading data...",
  "Memuat...": "Loading...",
  "Menyimpan...": "Saving...",
  "Mengirim...": "Sending...",
  "Tersalin ke Clipboard!": "Copied to Clipboard!",

  // POS & Kasir Operasional
  "Transaksi POS": "POS Transactions",
  "Cari berdasarkan struk, pelanggan": "Search by receipt, customer...",
  "Cari berdasarkan struk, pelanggan...": "Search by receipt, customer...",
  "Nomor Struk": "Receipt Number",
  "NOMOR STRUK": "RECEIPT NO.",
  "Tanggal & Waktu": "Date & Time",
  "TANGGAL & WAKTU": "DATE & TIME",
  "Pelanggan": "Customer",
  "PELANGGAN": "CUSTOMER",
  "Kasir": "Cashier",
  "KASIR": "CASHIER",
  "Jumlah": "Quantity",
  "JUMLAH": "AMOUNT",
  "Pembayaran": "Payment",
  "PEMBAYARAN": "PAYMENT",
  "Metode Pembayaran": "Payment Method",
  "Total Transaksi": "Total Transactions",
  "Total Penjualan": "Total Sales",
  "Total Omset": "Total Revenue",
  "Subtotal": "Subtotal",
  "Diskon": "Discount",
  "Pajak": "Tax",
  "Total Bayar": "Total Payment",
  "Kembalian": "Change",
  "Tunai": "Cash",
  "Kartu Debit": "Debit Card",
  "Kartu Kredit": "Credit Card",
  "Transfer Bank": "Bank Transfer",
  "Belum Lunas": "Unpaid",
  "Lunas": "Paid",
  "Batalkan Nota (Void)": "Void Receipt",
  "Tutup Sesi Kasir": "Close Cashier Session",
  "Buka Sesi Kasir": "Open Cashier Session",
  "Modal Awal Laci": "Opening Cash Float",
  "Kas Masuk": "Cash In",
  "Kas Keluar": "Cash Out",
  "Saldo Akhir Dihitung": "Calculated Ending Cash",
  "Saldo Fisik Laci": "Physical Drawer Cash",
  "Selisih Kas": "Cash Discrepancy",
  "Cetak Struk": "Print Receipt",
  "Kirim Struk WA": "Send WhatsApp Receipt",

  // Inventori, Stok, & Resep (BOM)
  "Stok Bahan Baku": "Raw Material Stock",
  "Level Stok Bahan": "Stock Levels",
  "Riwayat Mutasi Stok": "Stock Movement History",
  "Stock Opname Fisik": "Physical Stock Opname",
  "Susut & Kerusakan (Waste)": "Shrinkage & Waste",
  "+ Tambah Bahan Baku": "+ Add Raw Material",
  "+ Buat Resep BOM": "+ Create Recipe BOM",
  "+ Pesanan Pembelian (PO)": "+ Purchase Order (PO)",
  "Transfer Antar Cabang": "Inter-Branch Transfer",
  "Satuan Dasar Resep": "Recipe Base Unit",
  "Satuan Kulakan / Beli": "Purchasing Wholesale Unit",
  "Faktor Konversi Satuan": "Unit Conversion Factor",
  "Batas Minimum Stok (ROP)": "Reorder Point (ROP)",
  "HPP Dasar": "Base Cost (HPP)",
  "HPP Terhitung": "Calculated Cost",
  "Total Nilai Persediaan": "Total Inventory Value",
  "Stok Menipis": "Low Stock",
  "Stok Aman": "Safe Stock",
  "Stok Habis": "Out of Stock",
  "Pemasok / Vendor": "Supplier / Vendor",
  "Penerimaan Barang": "Goods Receipt",

  // Keuangan & Akuntansi
  "Arus Kas Operasional": "Operating Cash Flow",
  "Buku Kas Kecil": "Petty Cash Book",
  "Jurnal Umum Akuntansi": "General Ledger Journal",
  "Laporan Laba Rugi": "Profit & Loss Statement",
  "Neraca Saldo": "Trial Balance",
  "Rekonsiliasi EDC & QRIS": "EDC & QRIS Reconciliation",
  "Modal & Penarikan Payout": "Capital & Payouts",
  "Pendapatan Operasional": "Operating Revenue",
  "Beban Pokok Penjualan": "Cost of Goods Sold",
  "Beban Pokok Penjualan (HPP)": "Cost of Goods Sold (COGS)",
  "Laba Kotor": "Gross Profit",
  "Beban Operasional Toko": "Store Operating Expenses",
  "Laba Bersih": "Net Profit",
  "Debit": "Debit",
  "Kredit": "Credit",
  "Saldo Berjalan": "Running Balance",
  "Tarik Saldo S-Wallet": "Withdraw S-Wallet Balance",
  "Setor Kas": "Cash Deposit",

  // Klinik & Rekam Medis (RME)
  "Rekam Medis Elektronik (RME)": "Electronic Medical Records (EMR)",
  "Data Pasien Klinik": "Clinic Patient Records",
  "Antrean Pasien Hari Ini": "Today's Patient Queue",
  "Pemeriksaan Medis (SOAP)": "Clinical Examination (SOAP)",
  "Odontogram Gigi Terpadu": "Dental Odontogram",
  "Tagihan & Kasir Klinik": "Clinic Billing & Cashier",
  "Nomor Rekam Medis": "Medical Record Number",
  "Keluhan Utama Pasien": "Chief Complaint",
  "Diagnosa Primer (ICD-10)": "Primary Diagnosis (ICD-10)",
  "Tindakan Medis (ICD-9)": "Medical Procedure (ICD-9)",
  "Resep Obat Farmasi": "Pharmacy Prescription",
  "Panggil Pasien Berikutnya": "Call Next Patient",
  "Mulai Pemeriksaan": "Start Examination",
  "Selesai Pemeriksaan": "Complete Examination",
  "Sinkronisasi SATUSEHAT Kemenkes": "MoH SATUSEHAT Sync",

  // SDM, HRIS, & Penggajian
  "Hitung Gaji Otomatis": "Auto Calculate Payroll",
  "Gaji Pokok Karyawan": "Employee Base Salary",
  "Uang Lembur Shift": "Shift Overtime Pay",
  "Tunjangan Jabatan & Transport": "Position & Transport Allowances",
  "Potongan Keterlambatan": "Late Penalty Deductions",
  "Potongan Absensi Tanpa Keterangan": "Unexcused Absence Deductions",
  "Pajak Penghasilan (PPh 21)": "Income Tax (PPh 21)",
  "Gaji Bersih Diterima": "Take Home Pay",
  "Proses Pencairan Gaji": "Process Salary Disbursement",
  "Cetak Slip Gaji Digital": "Print Digital Payslip",
  "Kirim Slip via WhatsApp": "Send Payslip via WhatsApp",
  "Standar Operasional Prosedur (SOP)": "Standard Operating Procedures (SOP)",
  "+ Tambah Dokumen SOP": "+ Add SOP Document",
  "Laporan Produktivitas SDM": "Workforce Productivity Report",
  "Tingkat Kehadiran Kasir": "Cashier Attendance Rate",
  "Rata-rata Keterlambatan Masuk": "Average Clock-In Delay",

  // Superadmin, Owner, & Tata Kelola
  "Kelola Tenant Merchant": "Manage Merchant Tenants",
  "Paket Langganan & Fitur": "Subscription Plans & Features",
  "Integrasi WhatsApp Bot Hermes": "Hermes WhatsApp Bot Integration",
  "Log Audit & Aktivitas": "Audit & Activity Logs",
  "Kelola Cabang & Gerai": "Manage Branches & Outlets",
  "+ Tambah Cabang Baru": "+ Add New Branch",
  "Status Kuota Pertanyaan AI": "AI Query Quota Status",
  "Masa Aktif Paket Berlangganan": "Subscription Plan Validity",
  "Perpanjang Paket Sekarang": "Renew Subscription Plan",
  "Setujui Otorisasi": "Approve Authorization",
  "Tolak Otorisasi": "Reject Authorization",
  "Otorisasi General Manager": "General Manager Authorization",
  "Otorisasi Pemilik (Owner)": "Owner Authorization",

  // Aksi Umum & Dialog Konfirmasi
  "Apakah Anda yakin?": "Are you sure?",
  "Tindakan ini tidak dapat dibatalkan.": "This action cannot be undone.",
  "Format data tidak valid.": "Invalid data format.",
  "Kolom ini wajib diisi.": "This field is required.",
  "Perubahan berhasil disimpan.": "Changes successfully saved.",
  "Data berhasil dihapus.": "Data successfully deleted.",
  "Data berhasil ditambahkan.": "Data successfully added.",
  "Gagal memproses data.": "Failed to process data.",
  "Koneksi offline. Menampilkan data lokal.": "Offline mode. Showing local data."
};

// Fungsi Terjemahan Cerdas Universal (Resilient Multi-Strategy)
export function t(keyOrText, explicitLang) {
  if (!keyOrText) return "";
  const lang = explicitLang || (typeof window !== "undefined" ? localStorage.getItem("tijarah:lang") || "id" : "id");
  if (typeof keyOrText !== "string") return keyOrText;
  if (lang === "id") return keyOrText;

  // 1. Cek langsung di DICTIONARY.en
  if (DICTIONARY.en && DICTIONARY.en[keyOrText]) {
    return DICTIONARY.en[keyOrText];
  }

  // 2. Cek langsung di MASTER_TRANSLATIONS
  if (MASTER_TRANSLATIONS[keyOrText]) {
    return MASTER_TRANSLATIONS[keyOrText];
  }

  // 3. Cek versi trimmed
  const trimmed = keyOrText.trim();
  if (MASTER_TRANSLATIONS[trimmed]) {
    return keyOrText.replace(trimmed, MASTER_TRANSLATIONS[trimmed]);
  }

  // 4. Cek varian titik dua (contoh "Total Durasi:" -> cari "Total Durasi")
  if (trimmed.endsWith(":")) {
    const withoutColon = trimmed.slice(0, -1).trim();
    if (MASTER_TRANSLATIONS[withoutColon]) {
      return keyOrText.replace(trimmed, `${MASTER_TRANSLATIONS[withoutColon]}:`);
    }
  }

  // 5. Casing-insensitive fallback (contoh: "MENUNGGU OTORISASI" -> cocok dengan "Menunggu Otorisasi")
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(MASTER_TRANSLATIONS)) {
    if (k.toLowerCase() === lower) {
      if (trimmed === trimmed.toUpperCase()) return v.toUpperCase();
      return v;
    }
  }

  // 6. Reverse lookup dari DICTIONARY.id ke DICTIONARY.en
  if (DICTIONARY.id && DICTIONARY.en) {
    for (const [k, idVal] of Object.entries(DICTIONARY.id)) {
      if (idVal === trimmed && DICTIONARY.en[k]) {
        return keyOrText.replace(trimmed, DICTIONARY.en[k]);
      }
    }
  }

  return keyOrText;
}

export function useAccountLang() {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem("tijarah:lang") || "id";
    } catch {
      return "id";
    }
  });

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === "tijarah:lang" && (e.newValue === "id" || e.newValue === "en")) {
        setLangState(e.newValue);
      }
    };
    const handleCustom = (e) => {
      if (e.detail === "id" || e.detail === "en") {
        setLangState(e.detail);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("tijarah:lang_change", handleCustom);
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.lang = lang;
    }
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("tijarah:lang_change", handleCustom);
    };
  }, [lang]);

  const setLang = (newLang) => {
    try {
      localStorage.setItem("tijarah:lang", newLang);
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.lang = newLang;
      }
      window.dispatchEvent(new CustomEvent("tijarah:lang_change", { detail: newLang }));
    } catch {}
    setLangState(newLang);
  };

  const dict = DICTIONARY[lang] || DICTIONARY.id;
  const callableTranslator = (text) => t(text, lang);
  Object.assign(callableTranslator, dict);

  return { lang, setLang, t: callableTranslator };
}

export const GROUP_TRANSLATIONS = {
  "Umum": { id: "Umum", en: "General" },
  "Layanan & Akses": { id: "Layanan & Akses", en: "Services & Access" },
  "Platform": { id: "Platform", en: "Platform" },
  "Bisnis": { id: "Bisnis", en: "Business" },
  "Operasional": { id: "Operasional", en: "Operations" },
  "SDM": { id: "SDM & HRIS", en: "HR & Team" },
  "SDM & HRIS": { id: "SDM & HRIS", en: "HR & Team" },
  "Gudang & menu": { id: "Gudang & Menu", en: "Inventory & Menu" },
  "Keuangan": { id: "Keuangan", en: "Finance" },
  "Klinik": { id: "Klinik", en: "Clinic" },
  "Akun": { id: "Akun", en: "Account" }
};

export const ROLE_TRANSLATIONS = {
  superadmin: { id: "Superadmin Platform", en: "Platform Superadmin" },
  owner: { id: "Owner Merchant", en: "Merchant Owner" },
  gm: { id: "General Manager", en: "General Manager" },
  staff: { id: "Staff Kasir", en: "Cashier Staff" },
  dokter: { id: "Dokter Klinik", en: "Clinic Doctor" },
  member: { id: "Member Pelanggan", en: "Customer Member" }
};

export const PAGE_TRANSLATIONS = {
  "/app": { id: "Beranda", en: "Overview & Home" },
  "/app/alur": { id: "Alur kerja", en: "Workflows" },
  "/app/layanan/owner": { id: "Kelola Owner Merchant", en: "Manage Merchant Owners" },
  "/app/layanan/aktivitas": { id: "Monitoring Aktivitas Owner", en: "Owner Activity Monitor" },
  "/app/layanan/tiket": { id: "Tiket Bantuan CS", en: "CS Support Tickets" },
  "/app/layanan/tim": { id: "Kelola GM & Kasir/Staf", en: "Manage GM & Staff" },
  "/app/layanan/kebijakan": { id: "Kebijakan Berjenjang", en: "Tiered Policies" },
  "/app/layanan/pantau": { id: "Monitoring GM & Kasir/Staf", en: "GM & Staff Monitoring" },
  "/app/layanan/bantuan": { id: "Tiket ke Dukungan Tijarah", en: "Ticket to Tijarah Support" },
  "/app/layanan/kasir": { id: "Kelola Kasir Cabang", en: "Manage Branch Cashiers" },
  "/app/layanan/bertugas": { id: "Monitoring Kasir Bertugas", en: "On-Duty Cashier Monitor" },
  "/app/platform": { id: "Ringkasan platform", en: "Platform Overview" },
  "/app/tenant": { id: "Tenant", en: "Tenants" },
  "/app/paket": { id: "Paket & tagihan", en: "Plans & Billing" },
  "/app/integrasi": { id: "9router & Hermes", en: "9router & Hermes" },
  "/app/audit": { id: "Audit log", en: "Audit Log" },
  "/app/blueprint": { id: "Blueprint (privat)", en: "Blueprint (Private)" },
  "/app/dashboard": { id: "Dashboard eksekutif", en: "Executive Dashboard" },
  "/app/laba-rugi": { id: "Laba rugi", en: "Profit & Loss" },
  "/app/capital": { id: "Capital & payout", en: "Capital & Payout" },
  "/app/hermes": { id: "Hermes WhatsApp Bot", en: "Hermes WhatsApp Bot" },
  "/app/crm": { id: "Pelanggan (CRM)", en: "Customers (CRM)" },
  "/app/cabang": { id: "Cabang & outlet", en: "Branches & Outlets" },
  "/app/pemeriksaan": { id: "Rekam Medis (RME)", en: "Medical Records (EMR)" },
  "/app/pasien": { id: "Data Pasien", en: "Patient Records" },
  "/app/antrean": { id: "Antrean Klinik", en: "Clinic Queue" },
  "/app/tagihan": { id: "Tagihan & Kasir", en: "Billing & POS" },
  "/app/kasir": { id: "Kasir POS", en: "POS Cashier" },
  "/app/dapur": { id: "Display Dapur (KDS)", en: "Kitchen Display (KDS)" },
  "/app/shift": { id: "Sesi Kasir & Tutup Buku", en: "Cashier Sessions" },
  "/app/opname": { id: "Stok Opname", en: "Stock Opname" },
  "/app/kas": { id: "Arus kas", en: "Cash Flow" },
  "/app/sdm": { id: "SDM & Tim", en: "HR & Team" },
  "/app/karyawan": { id: "Data Karyawan", en: "Staff Records" },
  "/app/slip": { id: "Slip Gaji Saya", en: "My Payslip" },
  "/app/tukar-shift": { id: "Jadwal & Tukar Shift", en: "Schedule & Swap Shift" },
  "/app/absen": { id: "Absensi", en: "Attendance" },
  "/app/sdm/cuti": { id: "Pengajuan Cuti", en: "Leave Requests" },
  "/app/penggajian": { id: "Penggajian", en: "Payroll" },
  "/app/sdm/pengetahuan": { id: "Pengetahuan & SOP", en: "Knowledge & SOP" },
  "/app/persetujuan": { id: "Persetujuan", en: "Approvals" },
  "/app/sdm/laporan": { id: "Laporan SDM", en: "HR Reports" },
  "/app/produk": { id: "Produk & Menu", en: "Products & Menu" },
  "/app/resep": { id: "Resep & BOM", en: "Recipes & BOM" },
  "/app/stok": { id: "Stok bahan", en: "Raw Stock" },
  "/app/pembelian": { id: "Pembelian (PO)", en: "Purchasing (PO)" },
  "/app/transfer": { id: "Transfer antar cabang", en: "Branch Transfers" },
  "/app/denah": { id: "Denah meja", en: "Table Floorplan" },
  "/app/jurnal": { id: "Jurnal umum", en: "General Journal" },
  "/app/neraca": { id: "Neraca saldo", en: "Balance Sheet" },
  "/app/pesanan-online": { id: "Pesanan Online", en: "Online Orders" },
  "/app/rekonsiliasi": { id: "Rekonsiliasi EDC & QRIS", en: "Reconciliation" },
  "/app/kpi": { id: "KPI & Sasaran", en: "KPI & Objectives" },
  "/app/menu-engineering": { id: "Menu Engineering", en: "Menu Engineering" },
  "/app/proyeksi": { id: "Proyeksi kas & labour cost", en: "Cash & Labor Forecast" },
  "/app/promo": { id: "Promo & voucher", en: "Promos & Vouchers" },
  "/app/checklist": { id: "Checklist shift", en: "Shift Checklist" },
  "/app/copilot": { id: "Owner Copilot", en: "Owner Copilot" },
  "/app/akun/profil": { id: "Profil saya", en: "My Profile" },
  "/app/akun/keamanan": { id: "Keamanan & kredensial", en: "Security & Credentials" },
  "/app/akun/tampilan": { id: "Tampilan & bahasa", en: "Appearance & Language" },
  "/app/akun/notifikasi": { id: "Notifikasi", en: "Notifications" },
  "/app/akun/akses": { id: "Hak akses saya", en: "My Access Rights" },
  "/app/langganan": { id: "Langganan & kuota AI", en: "Subscription & AI Quotas" },
  "/app/akun/referral": { id: "Kode referral", en: "Referral Code" },
  "/app/platform-ops": { id: "Penagihan & flag", en: "Billing & Flags" }
};
