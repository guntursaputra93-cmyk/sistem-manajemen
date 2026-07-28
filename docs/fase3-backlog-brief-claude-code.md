# Perintah untuk Claude Code — Backlog Fase 3 Keuangan

Tiga item follow-up dari `docs/todo-fase4-keuangan-followups.md`. Kerjakan **satu item per sesi**, verifikasi dengan bukti konkret sebelum lanjut ke item berikutnya, sama seperti pola kerja Fase 3. Baca ulang `docs/todo-fase4-keuangan-followups.md` dulu untuk konteks penuh tiap item sebelum mulai.

Urutan pengerjaan: **Item 1 → Item 2 → Item 3** (dari yang paling menyentuh integritas jurnal ke yang paling berdiri sendiri).

---

## Item 1 — Granularitas akun potongan payroll non-kasbon

**Masalah:** jurnal payroll (`finalizePayrollRun`, Langkah 8b Fase 3) memecah kredit cuma jadi `11303 Piutang Karyawan` (offset kasbon) dan `21102 Utang Gaji` (sisanya) — BPJS/PPh 21/potongan lain ikut numpuk di `21102`, bukan ke akun kewajiban masing-masing.

**Ini menyentuh `finalizePayrollRun` lagi** — sudah 2x diubah di Fase 3 (Langkah 8 dan 8b), keduanya sensitif. Perlakukan dengan kehati-hatian yang sama: baca ulang kode sampai paham penuh, jalankan baseline SEBELUM perubahan, jalankan ulang SEMUA skenario regresi (termasuk skenario kasbon dari Langkah 8/8b) SESUDAH perubahan, tunjukkan hasilnya identik untuk kasus yang tidak terpengaruh.

Langkah teknis:
1. `salary_components` (schema di `src/drizzle/schema/salaryComponents.ts`) belum punya relasi ke `chart_of_accounts` sama sekali. Tambahkan kolom `liability_account_id` (uuid, nullable, fk `chart_of_accounts.id`, `onDelete: "restrict"` — ikuti pola FK finansial existing) khusus untuk komponen bertipe `potongan`. Nullable karena tidak semua company langsung mengisi ini — kalau kosong, fallback ke perilaku lama (masuk ke `21102 Utang Gaji`), supaya company yang belum sempat konfigurasi tidak jurnalnya jadi error.
2. Halaman admin kelola `salary_components` (cari lokasinya di `src/app/(dashboard)/[companySlug]/sdm/...`) ditambah field pilih akun kewajiban (dropdown akun posting kelompok `2xxxx`, khusus untuk baris `component_type='potongan'`). Validasi: akun yang dipilih harus posting (`is_header=false`) dan `account_type='kewajiban'`.
3. Di `finalizePayrollRun`: untuk tiap baris potongan di payslip, kalau komponennya (via `salary_components`) punya `liability_account_id` terisi, kredit ke akun itu sejumlah nominal potongan tsb (baris jurnal terpisah per akun kewajiban yang dipakai, digabung kalau beberapa karyawan pakai akun sama — ikuti pola agregasi multi-baris seperti penyusutan Langkah 7). Kalau `liability_account_id` kosong, tetap kredit ke `21102 Utang Gaji` seperti sekarang (perilaku lama tidak berubah untuk company yang belum konfigurasi).
4. Kasbon (`11303`) TIDAK terpengaruh perubahan ini — tetap logic khusus dari Langkah 8b, jangan disatukan ke mekanisme `liability_account_id` yang baru ini.
5. Verifikasi dengan data nyata (company test, dibersihkan setelahnya): konfigurasikan 1-2 `salary_components` potongan dengan `liability_account_id` terisi (misal BPJS → akun kewajiban baru/existing yang sesuai), 1 komponen potongan sengaja dibiarkan kosong (fallback), jalankan payroll → tunjukkan jurnal memecah kredit sesuai konfigurasi, total tetap balance, dan skenario regresi Fase 3 (baseline tanpa kasbon, skenario kasbon 3 cicilan) tetap identik hasilnya.
6. Update `docs/todo-fase4-keuangan-followups.md`: tandai item 1 selesai atau perbarui catatannya sesuai hasil akhir.

---

## Item 2 — Item rekonsiliasi bank manual (non-ledger)

**Konteks:** `bank_reconciliation_items.journal_entry_line_id` sudah nullable sejak Langkah 9, tapi belum ada jalur untuk membuat baris manual — semua item sekarang selalu digenerate otomatis dari `journal_entry_lines`.

Langkah teknis:
1. Tambahkan aksi "Tambah Item Manual" di halaman detail rekonsiliasi (`keuangan/rekonsiliasi-bank/[id]` atau path yang sesuai) — form input: `amount`, `description`/`notes` (arah debit/kredit atau tanda +/-, sesuaikan dengan representasi yang sudah dipakai untuk item otomatis), `is_cleared`.
2. Item manual disimpan dengan `journal_entry_line_id=null` (sudah sesuai skema), tapi butuh kolom tambahan untuk menyimpan nominalnya sendiri kalau kolom nominal sekarang cuma diambil dari `journal_entry_line_id` (`join`) — cek dulu skema `bank_reconciliation_items` existing, kalau memang belum ada kolom `amount`/`description` independen, tambahkan lewat migrasi (nullable, dipakai hanya saat `journal_entry_line_id IS NULL`).
3. Item manual **tidak mengubah `book_balance`** (yang tetap murni dari Buku Besar, Langkah 3/9) — item manual cuma memengaruhi kalkulasi selisih rekonsiliasi (representasi outstanding item yang belum tercatat di jurnal perusahaan tapi sudah muncul di rekening koran, atau sebaliknya). Pastikan logic selisih di `keuangan/rekonsiliasi-bank/realisasi` (atau nama halaman yang sesuai) memperhitungkan item manual dengan benar — laporkan formulanya secara eksplisit sebelum dianggap selesai, karena ini titik yang gampang salah tafsir arah tambah/kurang.
4. Guard: item manual hanya bisa ditambah/dihapus selama `bank_reconciliations.status='draft'` — begitu `status='selesai'`, immutable sama seperti item otomatis (konsisten dengan guard immutability yang sudah ada di Langkah 9).
5. RLS/`hasPermission` ikut pola halaman rekonsiliasi existing, tidak perlu policy baru.
6. `audit_trails` untuk penambahan/penghapusan item manual.
7. Verifikasi dengan data nyata: buat rekonsiliasi baru, tambah 1 item manual (misal biaya admin bank yang kelihatan di rekening koran tapi belum dijurnal), tunjukkan selisih rekonsiliasi berubah sesuai arah yang benar, coba selesaikan rekonsiliasi dengan item manual belum `is_cleared` dan tanpa `notes` → harus tetap ditolak (guard sama seperti item otomatis di Langkah 9), lalu coba hapus item manual setelah `status='selesai'` → harus ditolak.
8. Update `docs/todo-fase4-keuangan-followups.md`: tandai item 2 selesai.

---

## Item 3 — Status `jatuh_tempo` AR tidak real-time

**Konteks:** `refreshOverdueInvoiceStatuses` cuma dipanggil saat halaman `keuangan/piutang` dibuka. Sistem ini sejauh ini tidak punya infrastruktur cron/scheduled job sama sekali (dicek: tidak ada `vercel.json` atau setup cron lain di repo).

**Ini keputusan arsitektur, bukan cuma nambah fungsi** — kalau mau benar-benar real-time butuh infrastruktur baru (misal Vercel Cron) yang belum pernah dipakai di project ini. Konfirmasi ke saya (Gtr) dulu kalau mau menambah infrastruktur baru macam ini, jangan langsung eksekusi.

Dua opsi, pilih salah satu, laporkan alasannya:

- **Opsi A (rekomendasi, tanpa infra baru):** perluas pemanggilan `refreshOverdueInvoiceStatuses` ke titik masuk yang lebih sering dilalui admin — misal dipanggil juga saat dashboard perusahaan dibuka (bukan cuma halaman piutang), atau saat admin login pertama kali di hari itu. Ini tidak menyelesaikan "real-time" sepenuhnya tapi jauh mengurangi kemungkinan status basi tanpa menambah infrastruktur operasional baru (server cron, dsb) yang harus dipelihara.
- **Opsi B (infra baru, perlu konfirmasi Gtr dulu):** tambahkan Vercel Cron (`vercel.json` + API route terproteksi) yang memanggil `refreshOverdueInvoiceStatuses` untuk semua company setiap hari (misal jam 00:05). Ini infrastruktur baru pertama di project — kalau ini yang dipilih, tulis juga bagaimana route itu diamankan (bukan endpoint publik biasa) dan bagaimana kegagalan cron (misal 1 company gagal) tidak menggagalkan company lain.

Verifikasi (untuk opsi manapun): buat invoice test dengan `due_date` di masa lalu tanpa pembayaran, tunjukkan status ter-refresh jadi `jatuh_tempo` di titik pemanggilan baru (dashboard load / cron), bukan cuma di halaman piutang seperti sekarang.

Update `docs/todo-fase4-keuangan-followups.md`: tandai item 3 selesai, sebutkan opsi mana yang dipilih dan alasannya.

---

## Catatan umum

- Item 1 menyentuh payroll lagi — paling sensitif dari ketiganya, perlakukan sesuai standar kehati-hatian Fase 3 (baca dulu, baseline dulu, regresi wajib dibuktikan).
- Item 2 dan 3 lebih berdiri sendiri, risiko regresi ke modul lain kecil.
- Konfirmasi ke Gtr sebelum migrasi skema besar/destruktif, dan sebelum memilih Opsi B di Item 3 (infrastruktur cron baru).
- Satu item selesai + terverifikasi → berhenti, tunggu konfirmasi saya sebelum lanjut ke item berikutnya.
