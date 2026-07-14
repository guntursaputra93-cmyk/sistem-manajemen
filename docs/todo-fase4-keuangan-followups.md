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

## 2. Item rekonsiliasi bank manual (non-ledger) belum diimplementasikan

**Konteks:** Langkah 9 — `bank_reconciliation_items.journal_entry_line_id`
sengaja dibuat nullable untuk mengakomodasi kemungkinan item manual (mis. biaya
admin bank yang belum tercatat di jurnal perusahaan) di masa depan.

**Dampak saat ini:** setiap item rekonsiliasi SELALU digenerate otomatis dari
`journal_entry_lines` — tidak ada UI/logic untuk menambah baris manual.

**Follow-up:** kalau kebutuhan ini muncul (mis. biaya bank yang baru terlihat
di rekening koran tapi belum dijurnal), bangun form tambah item manual +
tentukan bagaimana item semacam itu direkonsiliasi ke buku besar.

## 3. Status "jatuh_tempo" invoice AR tidak real-time (tidak ada scheduled job)

**Konteks:** Langkah 4 — sistem ini tidak punya mekanisme cron/trigger sama
sekali (Fase 3 Bagian 0). `refreshOverdueInvoiceStatuses` hanya dipanggil saat
halaman daftar invoice (`keuangan/piutang`) dibuka.

**Dampak saat ini:** invoice yang sudah lewat jatuh tempo tapi belum ada
pembayaran baru maupun kunjungan ke halaman daftar invoice akan tetap
menunjukkan status lama (`belum_dibayar`/`sebagian`) sampai halaman dibuka
lagi — bisa "basi" untuk kebutuhan seperti notifikasi otomatis.

**Follow-up:** kalau presisi real-time diperlukan (mis. untuk pengingat
otomatis jatuh tempo), pertimbangkan scheduled job/cron di fase berikutnya
yang memanggil `refreshOverdueInvoiceStatuses` secara berkala untuk semua
company.
