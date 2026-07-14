# Perintah untuk Claude Code — Fase 3: Keuangan (Sistem Manajemen Sapta)

Tempel ini ke sesi Claude Code di repo `sistem-manajemen`. Kerjakan **satu langkah per sesi** (Bagian 5), verifikasi dengan bukti konkret (query hasil, screenshot test, log) sebelum lanjut ke langkah berikutnya. Jangan lompat langkah.

---

## 0. Konteks wajib dibaca dulu

Baca ulang sebelum menyentuh kode:

- `AGENTS.md` / `CLAUDE.md` di root repo.
- Pola schema Drizzle: `src/drizzle/schema/*.ts` + barrel `src/drizzle/schema/index.ts`.
- Pola RLS: `drizzle/migrations/000N_create_x.sql` + `000N+1_rls_x.sql` berpasangan. Contoh referensi row-level tambahan: `drizzle/migrations/0036_rls_employees_and_position_history.sql` (policy `AS RESTRICTIVE` untuk `employees`).
- Pola nomor surat: `src/lib/letters/numbering.ts` — `getNextSequenceNumber(tx, {companyId, departmentId, sequenceType})`, atomik via `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`. Pakai pola yang sama (tabel sequence baru atau extend yang ada) untuk nomor jurnal/invoice.
- Payroll existing: `src/lib/hr/payroll.ts` (`generatePayslipsForRun`, `finalizePayrollRun`) dipanggil dari `src/app/(dashboard)/[companySlug]/sdm/payroll/actions.ts`. Kolom `payslips.journalEntryId` sudah ada di schema tapi belum di-`.references()` — itu reserved slot untuk Fase 3, JANGAN diubah tipenya, cukup tambahkan FK constraint saat tabel `journal_entries` sudah ada.
- Module toggle: `src/lib/modules/index.ts` (`MODULE_KEYS`, `MODULE_LABEL`), tabel `companyModules`.
- Audit trail: `src/lib/audit/log.ts` — `logAudit(entry)`, selalu lewat `dbAdmin` (bypass RLS).
- Status UI: `src/components/ui/TrailStepper.tsx` + helper `src/lib/ui/approvalTrail.ts`.
- Konvensi: **app-level function, bukan DB trigger**, untuk semua logika otomatis (lihat komentar di `src/drizzle/schema/leaveBalances.ts`). Konvensi FK finansial: `onDelete: "restrict"` bukan `"cascade"` untuk record finansial (lihat `payslips.employeeId`) — pakai pola sama untuk FK di tabel Keuangan yang menunjuk `employees`/`contracts`.

**Batasan keras (ulangi ke diri sendiri sebelum eksekusi tiap langkah):**
- Modul ini setara sensitif dengan payroll. RLS + defense-in-depth wajib, bukan opsional.
- Modifikasi `generatePayslipsForRun` untuk kasbon (Langkah 8) **bukan area aman-disentuh-bebas** — baca kode existing sampai paham penuh, jalankan ulang test/skenario payroll yang sudah ada SEBELUM dan SESUDAH perubahan, laporkan hasilnya sebagai bukti tidak ada regresi.
- Konfirmasi ke Gtr dulu sebelum: migrasi skema besar/destruktif, atau perubahan apa pun ke logika payroll existing di luar penambahan baris potongan kasbon.
- Jangan pakai DB trigger untuk status invoice otomatis, penyusutan, update `remaining_balance` kasbon, dll — semua app-level function.

---

## 1. Chart of Accounts — struktur final (WAJIB, sudah dikonfirmasi Gtr)

Spesifikasi awal minta level 1-4. **Ini direvisi jadi 3 level** atas keputusan Gtr. Field `level` di skema jadi rentang **1-3**, bukan 1-4. Aturan:

- **Level 1** = kode `X0000` (root: header, `is_header=true`)
- **Level 2** = kode `XX000` (kelompok: header, `is_header=true`)
- **Level 3** = sisanya. Level 3 bisa header (`is_header=true`) ATAU posting (`is_header=false`), dibedakan oleh `is_header`, bukan oleh `level`:
  - Kalau grup `XXX00` asli punya **≥2 anak** (`XXXXX`): `XXX00` tetap jadi baris header level 3 (`is_header=true`), tiap `XXXXX` di bawahnya jadi baris posting level 3 (`is_header=false`), `parent_code` = kode header `XXX00`.
  - Kalau grup `XXX00` asli **tidak punya anak sama sekali**: `XXX00` itu sendiri jadi baris posting level 3 langsung (`is_header=false`), `parent_code` = kode level 2 (`XX000`).
  - Kalau grup `XXX00` asli **cuma punya 1 anak**: **buang baris header `XXX00`**, pakai kode anaknya (`XXXXX`) sebagai satu-satunya baris level 3 posting (`is_header=false`), `parent_code` = kode level 2 (`XX000`). Kode `XXX00` yang dibuang TIDAK di-seed sama sekali.

Kode yang dibuang dengan aturan "cuma 1 anak" (jangan seed baris ini, langsung pakai anaknya): `11100`, `12300`, `21200`, `21300`, `21400`, `21500`, `32100`, `42200`.

### account_type & normal_balance

Default dari digit pertama kode (sesuai spesifikasi awal): `1`=aset/debit, `2`=kewajiban/kredit, `3`=modal/kredit, `4`=pendapatan/kredit, `5`=hpp/debit, `6`=biaya/debit.

**Kecuali — akun kontra-aset, normal_balance dibalik jadi `kredit` meski `account_type='aset'`:**
- `11400 Piutang Tak Tertagih` (allowance/cadangan piutang ragu) — `kredit`
- `12201 Akumulasi Penyusutan Perangkat Elektronik` — `kredit`
- `12202 Akumulasi Penyusutan Perabot & Inventaris Kantor` — `kredit`
- `12203 Akumulasi Penyusutan Kendaraan` — `kredit`

Semua akun lain ikuti aturan default digit pertama.

### Daftar akun final untuk di-seed (code, name, level, parent_code, account_type, normal_balance, is_header)

```
10000  ASET                                              L1  -              aset         debit   header
11000  ASET LANCAR                                        L2  10000         aset         debit   header
11101  Petty Cash                                         L3  11000         aset         debit   posting   (kode header 11100 dibuang)
11200  BANK                                                L3  11000         aset         debit   header
11201  Bank Mandiri                                        L3  11200         aset         debit   posting
11202  Bank BCA                                            L3  11200         aset         debit   posting
11203  Bank BNI                                             L3  11200         aset         debit   posting
11300  PIUTANG                                             L3  11000         aset         debit   header
11301  Piutang Usaha                                       L3  11300         aset         debit   posting
11302  Piutang Non Usaha                                   L3  11300         aset         debit   posting
11303  Piutang Karyawan                                    L3  11300         aset         debit   posting
11400  Piutang Tak Tertagih                                L3  11000         aset         KREDIT  posting   (kontra-aset, tanpa anak)
11500  UANG MUKA                                           L3  11000         aset         debit   header
11501  Uang Muka Dinas                                     L3  11500         aset         debit   posting
11502  Uang Muka Operasional                               L3  11500         aset         debit   posting
11600  DIBAYAR DIMUKA                                      L3  11000         aset         debit   header
11601  Sewa Dibayar Dimuka                                 L3  11600         aset         debit   posting
11602  Lain-Lain Dibayar Dimuka                            L3  11600         aset         debit   posting
11700  PAJAK DIBAYAR DIMUKA                                L3  11000         aset         debit   header
11701  PPN Masukan                                         L3  11700         aset         debit   posting
11702  PPH 23                                              L3  11700         aset         debit   posting
11800  Aktiva Lain-Lain                                    L3  11000         aset         debit   posting   (tanpa anak)
12000  AKTIVA TETAP                                        L2  10000         aset         debit   header
12100  PERALATAN & INVENTARIS KANTOR                       L3  12000         aset         debit   header
12101  Perangkat Elektronik                                L3  12100         aset         debit   posting
12102  Perabot Dan & Inventaris Kantor                     L3  12100         aset         debit   posting
12103  Kendaraan                                           L3  12100         aset         debit   posting
12200  PENYUSUTAN                                          L3  12000         aset         debit   header
12201  Akumulasi Penyusutan Perangkat Elektronik           L3  12200         aset         KREDIT  posting   (kontra-aset)
12202  Akumulasi Penyusutan Perabot & Inventaris Kantor    L3  12200         aset         KREDIT  posting   (kontra-aset)
12203  Akumulasi Penyusutan Kendaraan                      L3  12200         aset         KREDIT  posting   (kontra-aset)
12301  Amortisasi                                          L3  12000         aset         debit   posting   (kode header 12300 dibuang)
20000  HUTANG                                              L1  -              kewajiban    kredit  header
21000  HUTANG LANCAR                                       L2  20000         kewajiban    kredit  header
21100  HUTANG USAHA                                        L3  21000         kewajiban    kredit  header
21101  Utang Usaha                                         L3  21100         kewajiban    kredit  posting
21102  Utang Gaji                                          L3  21100         kewajiban    kredit  posting
21103  Utang Honor                                         L3  21100         kewajiban    kredit  posting
21201  Utang PPH 21                                        L3  21000         kewajiban    kredit  posting   (kode header 21200 dibuang)
21301  Pendapatan Diterima Dimuka                          L3  21000         kewajiban    kredit  posting   (kode header 21300 dibuang)
21401  Biaya Akrual                                        L3  21000         kewajiban    kredit  posting   (kode header 21400 dibuang)
21501  Hutang Lancar Lain-Lain                             L3  21000         kewajiban    kredit  posting   (kode header 21500 dibuang)
22000  HUTANG JANGKA PANJANG                                L2  20000         kewajiban    kredit  header
22100  Hutang Bank                                         L3  22000         kewajiban    kredit  posting   (tanpa anak)
22200  Hutang Imbalan Kerja                                L3  22000         kewajiban    kredit  posting   (tanpa anak)
30000  MODAL                                                L1  -              modal        kredit  header
31000  MODAL DISETOR                                       L2  30000         modal        kredit  header
31100  MODAL DISETOR                                       L3  31000         modal        kredit  header
31101  Modal Pemilik 1                                     L3  31100         modal        kredit  posting
31102  Modal Pemilik 2                                     L3  31100         modal        kredit  posting
31103  Hutang Modal Pemilik 1                              L3  31100         modal        kredit  posting
31104  Hutang Modal Pemilik 2                               L3  31100         modal        kredit  posting
32000  LABA RUGI                                           L2  30000         modal        kredit  header
32101  Laba Rugi Di Tahan                                  L3  32000         modal        kredit  posting   (kode header 32100 dibuang)
40000  PENDAPATAN                                          L1  -              pendapatan   kredit  header
41000  PENDAPATAN JASA                                     L2  40000         pendapatan   kredit  header
41100  PENJUALAN SERTIFIKASI                                L3  41000         pendapatan   kredit  header
41101  Penjualan SMK3                                      L3  41100         pendapatan   kredit  posting
41102  Penjualan Pra Audit                                 L3  41100         pendapatan   kredit  posting
41103  Penjualan Sertifikasi                               L3  41100         pendapatan   kredit  posting
42000  PENDAPATAN LAIN-LAIN                                 L2  40000         pendapatan   kredit  header
42100  PENDAPATAN BANK                                      L3  42000         pendapatan   kredit  header
42101  Bunga Bank Mandiri                                  L3  42100         pendapatan   kredit  posting
42102  Bunga Bank BCA                                      L3  42100         pendapatan   kredit  posting
42103  Bunga Bank BNI                                      L3  42100         pendapatan   kredit  posting
42201  Pendapatan Lain-Lain                                L3  42000         pendapatan   kredit  posting   (kode header 42200 dibuang)
43000  KOMISI                                              L2  40000         pendapatan   kredit  header
43100  KOMISI PENJUALAN                                     L3  43000         pendapatan   kredit  header
43101  Komisi Penjualan Audit                              L3  43100         pendapatan   kredit  posting
43102  Komisi Penjualan Pra Audit                           L3  43100         pendapatan   kredit  posting
43103  Komisi Penjualan Sertifikasi                        L3  43100         pendapatan   kredit  posting
50000  HPP                                                  L1  -              hpp          debit   header
51000  HPP AUDIT                                            L2  50000         hpp          debit   header
51100  BIAYA LANGSUNG OPERASIONAL AUDIT                     L3  51000         hpp          debit   header
51101  By Honor Auditor                                    L3  51100         hpp          debit   posting
51102  By Insentif Admin                                   L3  51100         hpp          debit   posting
51103  By Perjalanan Dinas                                 L3  51100         hpp          debit   posting
51104  By Subkontraktor                                    L3  51100         hpp          debit   posting
51105  By Alat & Perlengkapan                              L3  51100         hpp          debit   posting
51106  By Dokumentasi & Pelaporan                          L3  51100         hpp          debit   posting
51107  By Sertifikasi                                      L3  51100         hpp          debit   posting
51108  By PNBP                                             L3  51100         hpp          debit   posting
51109  By Bank                                             L3  51100         hpp          debit   posting
60000  BIAYA                                                L1  -              biaya        debit   header
61000  BIAYA OPERASIONAL                                    L2  60000         biaya        debit   header
61100  BIAYA SUMBER DAYA MANUSIA                            L3  61000         biaya        debit   header
61101  By Gaji                                             L3  61100         biaya        debit   posting
61102  By BPJS                                             L3  61100         biaya        debit   posting
61103  By Pelatihan & Sertifikasi                          L3  61100         biaya        debit   posting
61104  By Tunjangan Lainnya                                L3  61100         biaya        debit   posting
61105  By PPH 21                                           L3  61100         biaya        debit   posting
61200  BIAYA OPERASIONAL KANTOR                             L3  61000         biaya        debit   header
61201  By Sewa Gedung                                      L3  61200         biaya        debit   posting
61202  By Sewa Kendaraan                                   L3  61200         biaya        debit   posting
61203  By Percetakan dan Pengiriman                        L3  61200         biaya        debit   posting
61204  By ATK                                              L3  61200         biaya        debit   posting
61205  By RTK                                              L3  61200         biaya        debit   posting
61206  By Gedung                                           L3  61200         biaya        debit   posting
61207  By Kendaraan                                        L3  61200         biaya        debit   posting
61208  By Listrik                                          L3  61200         biaya        debit   posting
61209  By Internet                                         L3  61200         biaya        debit   posting
61210  By IT                                               L3  61200         biaya        debit   posting
61300  BIAYA PEMASARAN & PENGEMBANGAN BISNIS                L3  61000         biaya        debit   header
61301  By Pemasaran Iklan                                  L3  61300         biaya        debit   posting
61302  By Pengembangan Website                             L3  61300         biaya        debit   posting
61400  BIAYA ADMINISTRASI UMUM                              L3  61000         biaya        debit   header
61401  By Hukum & Notaris                                  L3  61400         biaya        debit   posting
61402  By Akuntansi & Pajak                                L3  61400         biaya        debit   posting
61403  By Asuransi                                         L3  61400         biaya        debit   posting
61404  By Akreditasi & Lisensi Lembaga                     L3  61400         biaya        debit   posting
61405  By Pajak & Retribusi                                L3  61400         biaya        debit   posting
61406  By Lain-Lain                                        L3  61400         biaya        debit   posting
61500  BEBAN KEUANGAN                                       L3  61000         biaya        debit   header
61501  By Bunga Pinjaman                                   L3  61500         biaya        debit   posting
61502  By Administrasi Bank                                L3  61500         biaya        debit   posting
61503  By Kerugian Piutang                                 L3  61500         biaya        debit   posting
```

**Seed instruction:** seed daftar di atas persis ke **semua 4 perusahaan** (universal template). Jangan bedakan per jenis bisnis saat seed — akun spesifik (`41101 Penjualan SMK3`, `51101 By Honor Auditor`, dll) tetap ikut di-seed ke semua company, admin non-Sapta akan rename/nonaktifkan manual lewat halaman admin COA nanti.

**Validasi wajib level app:** entri jurnal HANYA boleh menunjuk `chart_of_accounts` dengan `is_header=false`. Tolak di level aplikasi (bukan hanya UI) kalau ada percobaan jurnal ke akun header.

---

## 2. Urutan eksekusi (ikuti Bagian 5 spesifikasi, 1 langkah = 1 sesi)

1. `chart_of_accounts` (schema + migrasi + RLS) → seed data persis sesuai tabel Bagian 1 di atas, ke 4 perusahaan → halaman admin CRUD/kelola COA (rename, aktif/nonaktif; tidak boleh hapus akun yang sudah dipakai jurnal).
2. `journal_entries` + `journal_entry_lines` → validasi balance debit=kredit sebelum posting → validasi `is_header=false` saja yang boleh dijurnal → nomor jurnal (`JU/000123/VII/2026`) digenerate saat posting, pakai pola `getNextSequenceNumber` yang sudah ada → halaman input jurnal manual → posted tidak bisa diedit (hanya void + jurnal koreksi baru).
3. Buku Besar (query view, bukan tabel baru) + Neraca + Laba Rugi sebagai agregat dari `journal_entry_lines` (status posted saja).
4. `ar_invoices` + `ar_payments` — sumber data dari `contracts` (CRM), jurnal otomatis saat posting invoice & saat payment tercatat, status invoice dihitung app-level (`belum_dibayar`/`sebagian`/`lunas`/`jatuh_tempo`).
5. `hpp_project_costs` + laporan margin proyek (nilai kontrak/AR dikurangi total HPP per `contract_id`).
6. `rkap_budgets` (putuskan sendiri saat eksekusi apakah `rkap_budget_monthly` perlu untuk MVP atau tahunan cukup, laporkan alasan) + laporan realisasi vs anggaran (varians nominal & persen).
7. `fixed_assets` + `depreciation_runs` + tombol jalankan penyusutan manual (garis lurus, idempotent per `period_month`+`period_year`).
8. `kasbon_requests` + **modifikasi `generatePayslipsForRun`** (baca kode existing dulu, tambahkan baris potongan "Cicilan Kasbon" = `MIN(installment_amount, remaining_balance)` per karyawan dengan kasbon `disetujui` & `remaining_balance>0`, update `remaining_balance` & `status` setelah payslip `selesai`) + jurnal disbursement kasbon (Debit `11303 Piutang Karyawan`, Kredit kas/bank) → **jalankan ulang test/skenario payroll existing dan laporkan hasilnya sebelum dianggap selesai**.
9. `bank_reconciliations` + `bank_reconciliation_items` (`book_balance` dihitung otomatis dari Buku Besar akun `112xx`).
10. Daftarkan `module_key='keuangan'` di `src/lib/modules/index.ts`, terapkan RLS row-level tambahan (pola `employees`) untuk `journal_entries`/`journal_entry_lines`/tabel laporan sensitif, terapkan UI (token warna existing, `TrailStepper` untuk status invoice/kasbon), `logAudit` untuk posting jurnal/approval kasbon/perubahan status invoice.
11. Jalankan checklist Definisi Selesai di bawah, kumpulkan bukti untuk tiap poin.

---

## 3. Definisi "Selesai" — checklist wajib dengan bukti

- [ ] RLS aktif semua tabel baru; `staff`/`department_head` TERBUKTI tidak bisa akses laporan keuangan (test eksplisit, bukan asumsi)
- [ ] Jurnal debit≠kredit ditolak saat posting
- [ ] Akun `is_header=true` ditolak saat dipakai di `journal_entry_lines`
- [ ] Jurnal `posted` tidak bisa diedit — hanya via void + jurnal koreksi
- [ ] Nomor jurnal/invoice hanya muncul setelah posting, tidak ada nomor bolong dari draft batal
- [ ] Status AR invoice berubah otomatis sesuai pembayaran
- [ ] Margin proyek terhitung benar (kontrak/AR − total HPP)
- [ ] Penyusutan tidak bisa dijalankan 2x untuk periode sama
- [ ] Kasbon otomatis jadi potongan payslip, `remaining_balance` berkurang, `status` jadi `lunas` di 0 — DAN payroll tanpa kasbon tetap jalan normal (bukti regresi test)
- [ ] Rekonsiliasi bank: `book_balance` otomatis dari Buku Besar vs `statement_ending_balance`
- [ ] `audit_trails` tercatat untuk posting jurnal, approval kasbon, perubahan status invoice
- [ ] `company_modules` menunjukkan `keuangan` toggle independen per company

---

## 4. Pengingat gaya kerja

- Satu langkah Bagian 2 (urutan eksekusi) per sesi. Tunjukkan bukti (hasil query, log test, screenshot) sebelum lanjut.
- Konfirmasi ke saya (Gtr) sebelum migrasi skema besar/destruktif, atau sebelum mengubah logika payroll existing di luar penambahan potongan kasbon.
- Modifikasi payroll (Langkah 8) ditangani dengan kehati-hatian ekstra — bukan area aman-disentuh-bebas.
