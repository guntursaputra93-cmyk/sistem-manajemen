# Perintah untuk Claude Code — Verifikasi & Migrasi Item A + Item C (dikerjakan di Cowork)

Item A (COA jadi 1 kartu) dan Item C (Jurnal Cepat: template + entry cepat + panel draft
terbuka) **sudah ditulis kodenya di Cowork mode**, tapi di sana **tidak bisa** dijalankan
`tsc` / `next build` / `drizzle-kit` / migrasi DB (node_modules-nya instalasi Windows —
binari native SWC/esbuild gagal di Linux, dan mount filesystem-nya tidak stabil). Verifikasi
di Cowork **hanya** sebatas cek sintaks TypeScript per file (`ts.transpileModule`).

Tugasmu: **jalankan verifikasi penuh yang belum bisa dilakukan itu**, selesaikan urusan
migrasi/snapshot Drizzle dengan benar, dan buktikan runtime-nya jalan dengan data nyata.

## Aturan main (sama seperti pola Fase 3)

- **Baca dulu kode yang sudah ada sampai paham penuh** sebelum mengubah apa pun. File-file di
  bawah adalah sumber kebenaran — jangan menulis ulang dari asumsi.
- Ingat `AGENTS.md`: **ini bukan Next.js yang kamu kenal** — baca `node_modules/next/dist/docs/`
  sebelum menulis kode Next.js baru kalau perlu menyentuhnya.
- **Jangan percaya buta**: buktikan dengan `tsc`/`build`/hasil query nyata, bukan "kelihatannya benar".
- **Konfirmasi ke Gtr sebelum migrasi destruktif.** Migrasi Item C ini **aditif** (hanya
  CREATE tabel/enum baru + RLS), tidak menyentuh tabel lama — tapi tetap laporkan rencana
  sebelum apply ke DB yang penting.
- Uji dengan **company/data test**, lalu **bersihkan** setelahnya.
- Kalau menemukan bug di kode Cowork, **perbaiki** dan catat apa yang diperbaiki.

---

## Bagian 1 — Item A: COA jadi 1 kartu (UI, tanpa DB)

**Perubahan:**
- BARU: `src/components/ui/RowDrawer.tsx` — varian FormDrawer dengan trigger teks kecil ("Edit")
  untuk aksi per baris di tabel.
- DIUBAH: `src/app/(dashboard)/[companySlug]/keuangan/akun/page.tsx` — dari kartu-per-akun jadi
  satu tabel dalam satu kartu; indentasi pohon di kolom Nama; edit/hapus lewat RowDrawer per
  baris; filter `ListToolbar` (cari kode/nama, tipe akun, sifat header/posting, status aktif).
- `keuangan/akun/actions.ts` **TIDAK diubah** (create/update/deleteChartOfAccount tetap sama,
  guard hapus akun terpakai tetap utuh via FK restrict).

**Verifikasi:**
1. `npx tsc --noEmit` dan `npm run lint` bersih untuk kedua file.
2. `npm run dev`, buka halaman Chart of Accounts:
   - Pohon akun tampil urut + indentasi benar, baris header tebal.
   - Filter cari/tipe/sifat/status berfungsi (sinkron ke URL `?q=&tipe=&sifat=&status=`).
   - Drawer "Edit" per baris: ubah nama + status → tersimpan; hapus akun header/terpakai →
     tetap ditolak dengan pesan yang benar (guard FK restrict); hapus akun posting kosong → berhasil.
   - "Tambah Akun" masih jalan seperti sebelumnya.
3. Laporkan hasil dengan bukti (screenshot/log).

---

## Bagian 2 — Item C: Jurnal Cepat (template + entry cepat + panel draft)

### 2a. Urusan migrasi & snapshot Drizzle — **kerjakan ini dulu, hati-hati**

Di Cowork, migrasi **ditulis tangan** karena `drizzle-kit` tak bisa jalan:
- BARU: `drizzle/migrations/0077_create_journal_templates.sql` (CREATE enum
  `journal_template_side` + tabel `journal_templates` & `journal_template_lines` + FK + index).
- BARU: `drizzle/migrations/0078_rls_journal_templates.sql` (RLS tenant-isolation, pola
  `0061_rls_journal_module.sql`).
- DIUBAH: `drizzle/migrations/meta/_journal.json` — sudah ditambahkan entri idx **77** & **78**.
- **MASALAH:** tidak ada `meta/0077_snapshot.json`. Snapshot terakhir masih `0074`. Jadi
  `drizzle-kit generate` berikutnya akan salah-deteksi kedua tabel ini sebagai "baru".

**Pilih salah satu, laporkan mana yang dipilih:**

- **Opsi A (rekomendasi — biar snapshot konsisten, sesuai alur kerja repo ini yang memang pakai
  `drizzle-kit generate` untuk DDL + RLS tulis tangan):**
  1. Hapus dua entri idx 77 & 78 dari `meta/_journal.json`, dan hapus dua file SQL
     `0077_*.sql` + `0078_*.sql`.
  2. Pastikan `src/drizzle/schema/index.ts` sudah meng-export `journalTemplates` &
     `journalTemplateLines` (sudah ditambahkan di Cowork — cek).
  3. Jalankan `npx drizzle-kit generate` → ini menghasilkan migrasi CREATE **berikut snapshot**
     otomatis dari schema. Namai jelas (mis. `create_journal_templates`).
  4. Buat migrasi RLS sebagai **custom migration** berikutnya
     (`npx drizzle-kit generate --custom --name rls_journal_templates`) lalu tempel isi RLS dari
     `0078` lama (2 tabel: `journal_templates`, `journal_template_lines`,
     `ENABLE`+`FORCE ROW LEVEL SECURITY` + policy `_tenant_isolation`).
  5. Verifikasi SQL hasil generate cocok dengan schema (nama constraint/index/enum boleh beda
     dari versi tulis-tanganku — ikuti yang di-generate).

- **Opsi B (pakai file tulis-tangan apa adanya):** biarkan 0077/0078 + entri jurnalnya,
  jalankan migrate langsung. **Wajib** lalu jalankan `drizzle-kit generate` sekali untuk
  merekonsiliasi snapshot; kalau ia memunculkan migrasi yang membuat ulang tabel ini, itu tanda
  snapshot belum sinkron — selesaikan sampai `generate` bersih (tidak ada diff palsu).

Setelah migrasi beres, **apply ke DB dev** dan cek: `\d journal_templates`,
`\d journal_template_lines`, enum `journal_template_side`, dan RLS aktif
(`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'journal_template%';`).

### 2b. Verifikasi kode & tipe

File Item C (semua lolos cek **sintaks** di Cowork, tapi **belum di-typecheck penuh**):
- `src/drizzle/schema/journalTemplates.ts`, `src/drizzle/schema/journalTemplateLines.ts`
- `src/lib/finance/journalTemplates.ts` (`createQuickJournalFromTemplate` — atomik: header +
  baris + `postJournalEntry` dalam 1 transaksi; throw ⇒ rollback)
- `src/app/(dashboard)/[companySlug]/keuangan/jurnal/template/actions.ts`
- `.../keuangan/jurnal/template/page.tsx`
- `.../keuangan/jurnal/template/[id]/page.tsx`
- `.../keuangan/jurnal/cepat/actions.ts`
- `.../keuangan/jurnal/cepat/QuickJournalForm.tsx` (client, preview balance live)
- `.../keuangan/jurnal/cepat/page.tsx`
- DIUBAH: `.../keuangan/jurnal/page.tsx` (panel "Draft Terbuka" + tombol Template & Jurnal Cepat)

**Jalankan `npx tsc --noEmit` + `npm run lint` + `npm run build`.** Titik yang paling mungkin
kena error tipe (mohon pastikan lolos, perbaiki kalau perlu):
- Destrukturisasi `let created: typeof journalTemplates.$inferSelect; [created] = await withTenantContext(...)`
  di `template/actions.ts`.
- Server action `createQuickJournal` di-import langsung ke **client component**
  `QuickJournalForm.tsx` dan dipakai sebagai `form action` — pastikan pola ini valid di versi
  Next repo ini.
- Prop `Card description={selected.description ?? undefined}` dan `PageHeader actions={<div>…}`
  (bukan cuma FormDrawer) — pastikan tipenya diterima.
- Dua cabang ternary untuk `draftLines`/`creators` di `jurnal/page.tsx` (pakai
  `Promise.resolve([] as …)`) — pastikan tipenya menyatu.

### 2c. Verifikasi runtime dengan data nyata (lalu bersihkan)

1. Buat 1 template via UI (`Keuangan → Jurnal Umum → Template → Tambah Template`), mis.
   "Setor tunai ke bank", tambах 2 baris: **Debit** `11201`(atau akun bank posting) dan
   **Kredit** `11101 Kas` (sesuaikan COA test).
2. Buka **Jurnal Cepat**, pilih template itu:
   - Isi nominal sama di kedua sisi → indikator **Balance** hijau, tombol aktif → submit →
     jurnal **langsung posted** (dapat nomor `JU/…`), redirect ke detailnya. Cek jurnal balance
     dan `source_type='template'`, `source_id`=id template.
   - Isi nominal **timpang** → tombol tetap nonaktif (client). Paksa submit via manipulasi
     (atau uji unit lib) → `createQuickJournalFromTemplate` harus **throw & rollback**, tidak
     ada jurnal/baris yang tersisa di DB.
   - Isi < 2 baris berisi → ditolak ("minimal 2 baris").
3. **Panel Draft Terbuka** (`Keuangan → Jurnal Umum`): buat 1 draft manual tak balance → muncul
   di panel dengan badge **Selisih**/**Kosong** merah, umur, dan pembuat; draft balance → badge
   **Balance** hijau. Pastikan jurnal cepat **tidak** menyisakan draft (karena langsung posted).
4. **Regresi:** pastikan alur jurnal manual lama (buat draft → tambah baris → posting → void →
   koreksi) **tidak berubah** perilakunya.
5. Hapus semua data test (template, jurnal test) setelah selesai; kalau ada jurnal test yang
   sudah posted, void sesuai mekanisme normal (jangan hapus paksa dari DB kalau melanggar guard).

---

## Definisi selesai

- `tsc`/`lint`/`build` hijau untuk seluruh file Item A & C.
- Migrasi ter-apply, snapshot Drizzle konsisten (`drizzle-kit generate` bersih tanpa diff palsu),
  RLS aktif di 2 tabel baru.
- Bukti runtime: template dibuat, jurnal cepat balance → posted, timpang → rollback, panel draft
  menandai yang bermasalah, regresi jurnal manual aman.
- Laporkan opsi migrasi yang dipilih + perubahan/bugfix apa pun yang kamu lakukan.
- Data test dibersihkan.
