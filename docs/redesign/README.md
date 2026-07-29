# Fondasi Redesign Modul — Standar Komponen

Disetujui via mockup `01-fondasi-mockup.html`. Semua modul yang diredesign WAJIB memakai
pola ini (contoh penerapan pertama: `sdm/karyawan/page.tsx`).

## Tema warna: "Sunset Peach" (disetujui via mockup `02-tema-sunset-peach-mockup.html`)

Token di `globals.css`: `peach #F4B183`, `peach-soft #FBE3CD`, `peach-deep #B95C2E`
(terracotta — aksi utama), `coral #E8918A`, `butter #F6D8A8`, `success #6E9152`,
ink cokelat hangat `#3B332C`, bg krem `#FDF6EE`, focus ring `#D97742`.

Nama token lama (`sage`, `powder-blue`, `dusty-rose`) di-ALIAS ke nilai palet baru
supaya halaman lama ikut berpindah tema otomatis — saat menyentuh halaman, migrasikan
class-nya ke nama baru (`peach`/`coral`/`butter`). Badge varian `sage` = makna sukses →
dipetakan ke hijau `success`, bukan peach. Halaman auth memakai `AuthShell`
(+ `authInputClass`, `authButtonClass`).

Interaksi standar (halus & profesional): tombol utama terangkat saat hover, item
sidebar bergeser 2px saat hover, drawer meluncur cubic-bezier, ikon ✕ drawer berputar,
baris tabel menyala peach. Hormati `prefers-reduced-motion` untuk animasi baru.

## Komponen fondasi (`src/components/ui/`)

| Komponen | Fungsi |
|---|---|
| `PageHeader` | Breadcrumb + judul 20px + deskripsi + slot aksi kanan |
| `Button` | Tombol standar 13px (primary / ghost / destructive) |
| `FormDrawer` + `DrawerFooter` | Form tambah/edit di panel samping — menggantikan form yang selalu terbuka di atas tabel. `defaultOpen={Boolean(error)}` supaya form terbuka lagi saat server action mengembalikan `?error=` |
| `FormSection` + `FormField` + `inputClass` | Form dikelompokkan per bagian (① ② ③), label 12px, input 13px |
| `ListToolbar` | Bar cari (debounce 300ms) + filter select, sinkron ke URL `?q=` / `?<filter>=` — halaman memfilter server-side dari searchParams |
| `DataTable` (diperbarui) | Teks 13px, header 11.5px uppercase di latar `#FAF1E5`, hover peach |
| `StatCard` | Kartu statistik: angka berhitung naik saat masuk viewport (hormati reduced-motion), terangkat saat hover. Icon dioper sebagai JSX element dari server |
| `AuthShell` | Cangkang halaman auth: gradien + blob + kartu kaca (`authInputClass`, `authButtonClass`) |
| `Badge` (diperbarui) | 11.5px semibold |

## Aturan halaman daftar (list page)

1. Struktur: `PageHeader` (aksi = `FormDrawer`) → pesan sukses/error → `ListToolbar` → `DataTable` → `Pagination`.
2. Pencarian & filter dibaca dari `searchParams` dan diterapkan server-side; empty state
   dibedakan antara "belum ada data" vs "tidak cocok dengan filter".
3. Tidak ada lagi form tambah yang selalu terbuka di atas tabel.
4. Ukuran teks minimum konten: 13px (tabel, input); label/meta 12px; jangan kembali ke 10–11px.
5. Warna & identitas visual tetap token pastel yang ada (sage dsb.) — redesign ini merapikan
   tata letak, bukan mengganti tema.

## Status per modul

- [x] Fondasi + percontohan: SDM › Data Karyawan
- [x] SDM (19 halaman: karyawan, absensi, cuti, jenis-cuti, cuti-saya, kompetensi,
      jenis-kompetensi, cpd, cpd-saya, kalibrasi, payroll, komponen-gaji,
      struktur-gaji, gaji-saya + 5 halaman detail)
- [x] Tema Sunset Peach global + halaman auth (login, lupa/reset password)
- [x] Dashboard (header + StatCard interaktif)
- [x] Keuangan (19 halaman: akun, jurnal, buku besar, laba rugi, neraca, piutang,
      kasbon, aset tetap + penyusutan, HPP, margin proyek, RKAP + realisasi,
      rekonsiliasi bank + 5 halaman detail)
- [x] CRM (8 halaman: dashboard, organisasi, opportunities, contracts, proposal + 3 detail)
- [x] Persuratan (8 halaman: surat masuk/keluar, dokumen, arsip, monitoring + 3 detail)
- [x] Penjadwalan (4 halaman: daftar, kalender, rekap, detail)
- [x] Pengaturan (10 halaman — header/breadcrumb standar; form tambah masih Card,
      konversi ke drawer bisa jadi polish lanjutan)

SEMUA MODUL SELESAI, plus polish:
- [x] ListToolbar (cari/filter) di Surat Masuk, Surat Keluar, Dokumen
- [x] Drawer utk form Pengaturan (departemen, user, kategori-dokumen, pipeline,
      approval, akses-dokumen)
- [x] Halaman Pilih Perusahaan dirapikan (tombol Simpan tidak lagi mepet tepi)
- [x] Neraca & Laba Rugi: dropdown "Tingkat Detail COA" (level 1/2/3/semua) —
      saldo header sudah agregat, filter hanya menyaring baris
- [x] Laporan Arus Kas baru (lib/finance/cashFlow.ts + keuangan/arus-kas) —
      klasifikasi otomatis operasi/investasi/pendanaan dari akun lawan jurnal
      yang menyentuh kas/bank (111xx/112xx); menu di grup Keuangan
- [x] Neraca & Laba Rugi: tombol "Unduh Excel (CSV)" (data URI, BOM UTF-8,
      delimiter ;) + "Cetak / PDF" (window.print + @media print di globals.css)
- [x] Dashboard: grafik batang Pendapatan vs Biaya+HPP 12 bulan (CSS murni,
      gated modul keuangan + permission) + kartu "Perlu Perhatian" (invoice
      tempo ≤7 hari & sertifikat kedaluwarsa ≤3 bulan)
- [x] FlashToast global: ?success= → toast + URL dibersihkan (banner hijau
      statis otomatis hilang; ?error= tetap banner)
