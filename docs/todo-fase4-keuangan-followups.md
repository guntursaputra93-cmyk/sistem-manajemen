# TODO — Follow-up dari Fase 3 Keuangan (untuk fase berikutnya)

Tiga keterbatasan by-design yang sudah dilaporkan ke Gtr selama eksekusi Fase 3
(Langkah 4, 8b, dan 9), belum ditutup dalam scope Fase 3, dicatat di sini supaya
tidak hilang untuk perencanaan fase berikutnya.

## 1. Potongan payroll non-kasbon tidak granular per akun kewajiban

**Konteks:** Langkah 8b — jurnal payroll gabungan (`finalizePayrollRun`) memecah
kredit menjadi `11303 Piutang Karyawan` (offset kasbon) dan `21102 Utang Gaji`
(sisanya). Potongan lain seperti BPJS atau PPh 21 — kalau ada di
`salary_components` — ikut masuk ke `21102 Utang Gaji`, bukan ke akun kewajiban
masing-masing (mis. `Utang BPJS`, `Utang PPh 21`).

**Kenapa:** `salary_components` tidak punya kolom relasi ke `chart_of_accounts`
sama sekali, jadi tidak ada cara andal membedakan komponen potongan tanpa
menambah skema baru — di luar scope Langkah 8b.

**Dampak saat ini:** jurnal tetap balance (tidak ada bug), hanya belum
granular per jenis potongan di buku besar.

**Follow-up:** tambahkan kolom relasi akun ke `salary_components` (mis.
`liability_account_id`) kalau granularitas per jenis potongan diperlukan untuk
pelaporan.

## 2. Item rekonsiliasi bank manual (non-ledger) — ✅ SELESAI

**Konteks:** Langkah 9 — `bank_reconciliation_items.journal_entry_line_id`
sengaja dibuat nullable untuk mengakomodasi kemungkinan item manual (mis. biaya
admin bank yang belum tercatat di jurnal perusahaan) di masa depan.

**Solusi yang dipilih (Gtr): "langsung buat jurnal".** Item manual sekaligus
membuat & memposting jurnalnya (bukan baris menggantung tanpa jurnal), jadi buku
besar langsung benar. Implementasi:
- Kolom `is_manual` ditambahkan ke `bank_reconciliation_items` (migrasi 0088)
  sebagai penanda badge di UI.
- `addManualReconciliationItem` (`src/lib/finance/bankReconciliation.ts`):
  posting jurnal 2 baris via `createAndPostJournal` bertanggal akhir periode
  rekonsiliasi. `direction="kurang"` → Dr akun lawan / Cr bank (mis. biaya bank);
  `direction="tambah"` → Dr bank / Cr akun lawan (mis. bunga). Item ditaut ke
  baris jurnal BANK, `is_cleared=true`, `is_manual=true`.
- Action `addManualReconciliationItemAction` + form "Tambah Item Manual" di
  halaman detail (hanya saat draft & punya izin `MANAGE_BANK_RECONCILIATIONS`),
  lengkap dengan guard `requireModuleEnabledForAction`.
- Diverifikasi runtime (jurnal balance, item tertaut & cleared, summary
  menghitung item manual) dan lolos `next build` + lint.

## 3. Status "jatuh_tempo" invoice AR tidak real-time — ✅ ENDPOINT SIAP (tinggal wiring scheduler)

**Konteks:** Langkah 4 — sistem ini tidak punya mekanisme cron/trigger sama
sekali (Fase 3 Bagian 0). `refreshOverdueInvoiceStatuses` hanya dipanggil saat
halaman daftar invoice (`keuangan/piutang`) dibuka.

**Yang sudah dibangun (host-agnostic):**
- `refreshOverdueInvoiceStatusesAllCompanies(tx)` di `src/lib/finance/ar.ts` —
  iterasi SEMUA company, panggil `recalculateInvoiceStatus` untuk tiap invoice
  yang masih terbuka. Idempotent; harus dijalankan dengan context
  `role: "super_admin"`.
- Endpoint terproteksi `GET/POST /api/cron/refresh-overdue-invoices`
  (`src/app/api/cron/refresh-overdue-invoices/route.ts`). Guard header
  `Authorization: Bearer <CRON_SECRET>`. Kalau `CRON_SECRET` belum diset di env,
  endpoint MENOLAK (503) — tidak pernah terbuka anonim. Balikan JSON
  `{ ok, companiesProcessed, invoicesChecked }`.
- Diverifikasi runtime (invoice `belum_dibayar` lewat jatuh tempo → otomatis
  jadi `jatuh_tempo` saat endpoint logic dijalankan) dan lolos `next build`.

**Sisa keputusan Gtr — pilih SATU scheduler lalu wire ke endpoint di atas:**
1. **Vercel Cron** (kalau deploy di Vercel): tambah `vercel.json`
   ```json
   { "crons": [{ "path": "/api/cron/refresh-overdue-invoices", "schedule": "0 1 * * *" }] }
   ```
   Vercel otomatis mengirim header `Authorization: Bearer $CRON_SECRET` bila env
   `CRON_SECRET` diset di project.
2. **Supabase pg_cron + pg_net** (host-independent, DB-native): jadwalkan
   `net.http_post` ke URL endpoint dengan header bearer.
3. **Uptime/cron eksternal** (mis. cron-job.org, GitHub Actions schedule): hit
   URL endpoint tiap hari dengan header bearer.

Apa pun pilihannya: set env `CRON_SECRET` di server, dan cadence harian (mis.
jam 01:00) sudah cukup karena transisi `jatuh_tempo` hanya bergantung pada
pergantian tanggal.

## 4. Audit lapis guard keamanan (hasPermission / withTenantContext / requireModuleEnabled) belum dilakukan

**Konteks:** dari analisis knowledge graph proyek — `hasPermission()`
(`src/lib/rbac/permissions.ts:181`, 280 koneksi, betweenness centrality
tertinggi di graph), `withTenantContext()` (`src/lib/db/index.ts:42`, 119
pemakai, isolasi tenant via RLS session variable) dan `requireModuleEnabled()`
(`src/lib/modules/index.ts:48`, 59 pemakai, guard modul aktif per company)
adalah tiga lapis otorisasi independen yang seharusnya dilewati semua
page.tsx/actions.ts sebelum eksekusi aksi.

**Dampak saat ini:** belum ada audit sistematis yang memverifikasi bahwa
ketiga guard ini dipanggil konsisten di SEMUA modul — celah di satu page/action
(lupa panggil salah satu guard) tidak otomatis ditutup oleh guard lain karena
ketiganya independen (role, tenant, module toggle).

**Follow-up:** setelah semua modul/fase lain selesai ("ready semua"), lakukan
audit keamanan menyeluruh: cek tiap page.tsx/actions.ts di semua modul (Aset
Tetap, Rekonsiliasi Bank, Piutang, Jurnal, CRM, SDM, Surat Masuk/Keluar,
Dokumen, Pengaturan, dll.) memanggil kombinasi guard yang sesuai konteksnya,
cari page/action yang lupa salah satu dari tiga guard, dan verifikasi urutan
pemanggilan (hasPermission → requireModuleEnabled → withTenantContext) konsisten.

## 5. Skema penamaan Item lintas-inisiatif (FINAL)

**Konteks:** ada tiga penomoran "Item" yang artinya berbeda-beda dan hidup
berdampingan di repo ini:

- `docs/itemAC-verifikasi-brief-claude-code.md` → **Item A** = COA jadi 1 kartu,
  **Item C** = Jurnal Cepat (template + entry cepat + panel draft)
- `docs/fase3-backlog-brief-claude-code.md` → **Item 1/2/3** = backlog Fase 3
  Keuangan (granularitas potongan payroll, rekonsiliasi manual, jatuh_tempo AR)
- Inisiatif **Kesiapan Audit Kepatuhan Data** (commit 36c2933–40e16a9) →
  **Item A** = audit_trails append-only, **Item B** = metadata event auth,
  **Item C** = cakupan logAudit 100%, **Item D** = laporan & export audit trail,
  **Item E1/E2/E3** = tiga item kompetensi K3

**Dampak:** Penomoran Item tidak unik lintas dokumen; selalu sebutkan prefiks
dokumennya (`AUDIT-`/`FASE3-`/`ITEMAC-`) untuk menghindari salah rujuk.

**Skema penamaan final (disetujui Gtr) — pakai ini di semua rujukan berikutnya:**

- **Inisiatif Kesiapan Audit Kepatuhan Data:** `AUDIT-A`, `AUDIT-B`, `AUDIT-C`,
  `AUDIT-D`, `AUDIT-E1`, `AUDIT-E2`, `AUDIT-E3`
- **Backlog Fase 3 Keuangan:** `FASE3-1`, `FASE3-2`, `FASE3-3`
- **COA 1 kartu & Jurnal Cepat:** `ITEMAC-A`, `ITEMAC-C`

**Catatan status saat dicatat:** `FASE3-1` & `FASE3-2` sudah selesai (migrasi
0087 & 0088); `FASE3-3` endpoint cron sudah ada tapi **scheduler belum
di-wire** — jadi brief Fase 3 masih menggambarkan pekerjaan yang belum tuntas
dan belum boleh dianggap usang. Kedua file brief dipindahkan dari root ke
`docs/` dan kini ter-track: keduanya dokumen kerja aktif, bukan arsip mati.
