# Analisa Workflow per Modul — Kemudahan Penerapan untuk Staf

Analisa ini dibuat dari eksplorasi struktur aplikasi (12 modul utama, ~59 `actions.ts`, sistem status/enum, dan sistem notifikasi yang sudah ada) untuk menjawab dua hal: bagaimana workflow tiap modul bisa lebih mudah dijalankan staf operasional (bukan developer), dan kebutuhan tambahan apa yang akan sangat membantu ke depan.

## 1. Ringkasan kompleksitas per modul

Ukuran `actions.ts` dipakai sebagai proksi kasar jumlah aksi/aturan bisnis yang harus dipahami staf saat mengoperasikan modul tersebut, bukan ukuran kualitas kode.

**Kelompok paling kompleks (butuh perhatian ekstra untuk SOP):**
- Penjadwalan (401 baris actions) — alur assignment sumber daya, kalender, rekap.
- Jurnal Keuangan (369 baris) — entry manual, posting, void; kesalahan di sini langsung memengaruhi laporan keuangan.
- Karyawan/SDM (220 baris) — data induk yang dipakai modul cuti, absensi, payroll, kompetensi.
- Surat Keluar (213 baris) dan Dokumen (205 baris) — melibatkan approval dan penomoran otomatis.
- Proposal CRM (203 baris) — terhubung ke Opportunities dan Organisasi.

**Kelompok status/workflow bertahap** (staf harus paham urutan status, bukan cuma isi form):
- Jurnal: `draft → posted → void`
- Payroll: `draft → diproses → selesai`
- Rekonsiliasi Bank: `draft → selesai`
- Piutang (AR): `draft → belum_dibayar → sebagian → lunas → jatuh_tempo`
- Kasbon: `pending → disetujui/ditolak → lunas`
- Cuti: `pending → approved/rejected → cancelled`
- Approval umum (dipakai lintas modul via `pengaturan/approval`): `pending → approved/rejected`

Pola ini konsisten tapi terminologi status **belum seragam** — ada yang bahasa Indonesia (`disetujui`, `selesai`), ada yang Inggris (`approved`, `open`, `won`, `lost`). Untuk staf yang tidak terbiasa dengan istilah campuran ini bisa membingungkan, terutama saat membaca badge status di UI.

## 2. Titik-titik yang berpotensi menyulitkan staf

**a. Multi-guard tanpa penjelasan di UI.** Sebagaimana dibahas di analisa RBAC sebelumnya, tiap aksi melewati `hasPermission` → `requireModuleEnabled` → `withTenantContext`. Kalau gagal di salah satu, staf hanya melihat redirect atau pesan generik — tidak ada indikasi "kenapa" (role kurang? modul belum aktif untuk perusahaan ini?). Ini sumber tiket support paling umum di sistem berlapis begini.

**b. Modul saling bergantung tapi tidak terlihat jelas di UI.** Contoh: SDM Payroll bergantung pada Komponen Gaji + Struktur Gaji + Kasbon + Absensi/Cuti sudah benar dulu. Kalau staf payroll menjalankan `finalizePayrollRun` sebelum data pendukung lengkap, hasilnya bisa salah tanpa peringatan proaktif di awal alur (baru ketahuan pas hasil jurnal aneh).

**c. Form besar tanpa panduan bertahap.** Modul dengan actions besar (jurnal, penjadwalan, karyawan) kemungkinan formnya juga padat field dalam satu halaman. Tanpa wizard/step-by-step, staf baru rawan salah isi terutama untuk transaksi yang menyentuh akuntansi (jurnal, aset tetap, payroll) — kesalahan di sana sulit di-undo karena prinsip immutability yang sudah diterapkan (posted/selesai = terkunci).

**d. Istilah status campur bahasa.** Disebut di atas — kecil tapi berulang, memperlambat staf yang membaca laporan/badge.

## 3. Rekomendasi agar workflow lebih mudah diterapkan staf

**Per modul, prioritas tinggi dulu:**

1. **Pesan error yang actionable**, bukan cuma redirect diam-diam. Untuk `requireModuleEnabled` dan `hasPermission`, tampilkan pesan spesifik ("Modul Payroll belum diaktifkan untuk perusahaan Anda — hubungi Admin" / "Role Anda tidak punya akses aksi ini") alih-alih redirect polos ke dashboard. Ini perubahan kecil tapi dampaknya besar untuk mengurangi kebingungan staf lintas semua modul sekaligus (karena guard ini dipakai di mana-mana).

2. **Checklist prasyarat di awal alur untuk proses lintas-modul** — terutama Payroll (cek: komponen gaji lengkap? absensi bulan ini sudah final? kasbon aktif sudah benar?) dan Jurnal Penutupan/Posting. Bisa berupa panel kecil di atas form yang menandai centang hijau/merah sebelum tombol submit aktif.

3. **Konsistensi bahasa status** — audit semua `pgEnum` status dan seragamkan ke Bahasa Indonesia (atau sebaliknya, tapi pilih satu), lalu mapping label tampilan terpisah dari nilai database supaya tidak perlu migrasi besar (cukup ubah `MODULE_LABEL`-style mapping seperti yang sudah ada di `src/lib/modules/index.ts`).

4. **Wizard/step form untuk transaksi berisiko tinggi & sulit di-undo**: Jurnal manual, Finalisasi Payroll, Penutupan Rekonsiliasi Bank, Penghapusan Aset Tetap. Pecah jadi 2-3 langkah dengan ringkasan konfirmasi sebelum submit final (khususnya karena status `posted`/`selesai` mengunci data).

5. **SOP tertulis per modul** — saat ini `README.md` masih boilerplate Next.js default, belum ada dokumentasi operasional untuk staf sama sekali. Ini gap paling mendasar: staf belajar dari trial-and-error atau tanya langsung, tidak ada rujukan tertulis.

## 4. Kebutuhan tambahan yang akan sangat membantu ke depan

Di luar penyederhanaan workflow di atas, beberapa gap infrastruktur/proses yang layak masuk perencanaan:

**a. Dokumentasi operasional (SOP) per modul untuk staf non-teknis.** Bukan dokumentasi teknis untuk developer (itu sudah ada di `docs/todo-*` dan brief Fase 3), tapi panduan "cara pakai" bergambar/screenshot per modul — siapa yang boleh apa, urutan langkah normal, apa yang harus dilakukan kalau status "jatuh_tempo"/"ditolak" muncul. Bisa mulai dari modul paling sering dipakai (Absensi, Cuti, Kasbon) karena volume penggunanya paling luas (semua karyawan, bukan cuma staf keuangan/admin).

**b. Onboarding checklist untuk staf baru dan admin baru** — siapa yang setup role, modul aktif per company, chart of accounts awal, struktur gaji. Saat ini proses ini kemungkinan hanya ada di kepala developer/Gtr.

**c. Perluasan sistem notifikasi.** `NotificationBell`/`getNotificationSummary` sudah ada tapi cek dulu cakupannya — idealnya staf terkait otomatis diberi tahu untuk: approval pending menunggu mereka (cuti, kasbon, dokumen), invoice mendekati/lewat jatuh tempo, rekonsiliasi bank draft yang mengendap lama, payroll run yang belum difinalisasi mendekati akhir bulan. Ini juga menjawab item backlog #3 (status jatuh_tempo tidak real-time) — kalau notifikasi proaktif dibangun, kebutuhan "real-time" jadi kurang mendesak karena staf tetap diberi tahu di titik penting tanpa harus buka halaman terus-menerus.

**d. Dashboard ringkasan per-role**, bukan hanya per-perusahaan. Staf HRD ingin lihat "cuti pending approval saya", staf keuangan ingin lihat "invoice jatuh tempo minggu ini", tanpa harus tahu navigasi lengkap semua modul.

**e. Panduan pemulihan kesalahan (troubleshooting guide)** khusus untuk data yang sudah terkunci (posted/selesai) — karena sistem sengaja dibuat immutable untuk integritas akuntansi, staf perlu tahu jalur resmi kalau terjadi salah input: apakah ada mekanisme koreksi/jurnal pembalik, atau harus eskalasi ke admin/developer.

**f. Lingkungan staging/latihan** terpisah dari data produksi, supaya staf baru bisa berlatih transaksi (terutama payroll dan jurnal) tanpa risiko mengunci data asli.

**g. Log audit yang bisa dibaca staf/admin (bukan cuma developer)** — `audit_trails` sudah dicatat di beberapa modul (disebut di backlog Item 2), tapi pastikan ada halaman untuk admin melihat riwayat "siapa mengubah apa kapan" per record, berguna untuk investigasi cepat tanpa perlu akses database langsung.

## 5. Urutan prioritas yang disarankan

1. Pesan error guard yang jelas (dampak lintas semua modul, effort kecil).
2. SOP tertulis untuk modul volume-tinggi (Absensi, Cuti, Kasbon, Payroll).
3. Checklist prasyarat + wizard untuk transaksi berisiko tinggi (Payroll, Jurnal, Rekonsiliasi, Aset Tetap).
4. Perluasan notifikasi proaktif (sekaligus menutup backlog Item 3).
5. Dashboard per-role dan onboarding checklist.
6. Konsistensi bahasa status, staging environment, audit log viewer — nice-to-have, bisa menyusul setelah 5 poin di atas jalan.

Catatan: analisa keamanan (audit lapis guard `hasPermission`/`withTenantContext`/`requireModuleEnabled`) sudah dicatat terpisah di backlog Item 4 (`docs/todo-fase4-keuangan-followups.md`) dan sengaja belum dikerjakan sesuai arahan — daftar di atas fokus ke kemudahan pemakaian, bukan audit keamanan.
