# TODO — Follow-up UI/UX (untuk fase berikutnya)

Backlog UI yang ditemukan saat mengerjakan hal lain dan sengaja TIDAK dikerjakan
di sesi penemuannya, dicatat di sini supaya tidak hilang. Pola sama seperti
`docs/todo-fase4-keuangan-followups.md`, tapi untuk urusan antarmuka.

Penamaan item: prefiks `UI-` supaya tidak bentrok dengan `AUDIT-` / `FASE3-` /
`ITEMAC-` (lihat item 5 di `docs/todo-fase4-keuangan-followups.md`).

## UI-1. DatePicker: klik ulang tanggal terpilih mengosongkan field

**Konteks:** ditemukan saat menguji fitur dropdown bulan/tahun DatePicker
(commit `266b6fa`). `DayPicker` dipakai dengan `mode="single"`, dan pada mode itu
react-day-picker memperlakukan klik pada tanggal yang SUDAH terpilih sebagai
toggle — `onSelect` menerima `undefined`, `setSelected(undefined)` jalan, hidden
input jadi string kosong.

**Ini perilaku bawaan yang sudah ada sebelum perubahan dropdown**, bukan regresi
dari commit tersebut. Terlihat saat tes otomatis menjalankan skenario "pilih
15 Januari 1985" dua kali berturut-turut: run kedua justru MENGOSONGKAN
`employees.birth_date` yang baru saja terisi, dan form tetap tersimpan tanpa
peringatan apa pun.

**Dampak saat ini:** staf yang ragu lalu mengklik ulang tanggal yang sama —
gerakan yang wajar untuk "memastikan" — justru mengosongkan field, lalu submit
menyimpan nilai kosong. Tidak ada indikasi visual bahwa nilainya hilang selain
teks trigger kembali ke placeholder `dd/mm/yyyy`. Paling berisiko di field yang
sudah berisi data lama (form edit), karena data yang hilang bukan data yang baru
saja diketik.

**Solusi kandidat (belum diputuskan):** manfaatkan prop `required` yang sudah ada
di `DatePicker` untuk menolak deselect — saat `required` bernilai true dan
`onSelect` mengirim `undefined`, pertahankan nilai sebelumnya alih-alih
mengosongkan. Tombol "Clear" tetap jadi satu-satunya jalan mengosongkan secara
sengaja (dan untuk field wajib, tombol itu semestinya ikut disembunyikan).

**Pekerjaan yang tersisa sebelum bisa dieksekusi:** audit field mana saja yang
memang wajib. `required` saat ini dipakai di sebagian call site saja dan
kewajibannya ditegakkan server-side di action masing-masing (lihat komentar di
`DatePicker.tsx`), jadi daftar `required` di komponen belum tentu lengkap —
`birthDate` di `sdm/karyawan/[id]/page.tsx` misalnya TIDAK ber-`required`
meski secara operasional penting. Cek juga apakah ada field yang memang sengaja
boleh dikosongkan lagi setelah diisi.

## UI-2. Modul Keuangan masih memakai `<input type="date">` native

**Konteks:** inventarisasi saat mengerjakan UI-1 menemukan 23 instance
`<input type="date">` native yang tersisa di 14 file, seluruhnya di modul
Keuangan + `pengaturan/audit-trail`. Komentar di `src/components/ui/DatePicker.tsx`
menyebut komponen itu "menggantikan `<input type="date">` native di semua form",
jadi migrasinya memang belum tuntas.

Sebarannya:
- **Form entri:** `keuangan/piutang` (invoiceDate, dueDate),
  `keuangan/piutang/[id]` (paymentDate), `keuangan/hutang` (billDate, dueDate),
  `keuangan/hutang/[id]` (paymentDate), `keuangan/hpp` (costDate),
  `keuangan/aset-tetap` (acquisitionDate),
  `keuangan/jurnal/baru/ManualJournalForm` (entryDate + jatuh tempo per baris),
  `keuangan/jurnal/cepat/QuickJournalForm` (idem),
  `keuangan/jurnal/transaksi-terbuka/[id]/SettleOpenItemForm` (entryDate)
- **Filter laporan:** `keuangan/buku-besar`, `keuangan/laba-rugi`,
  `keuangan/neraca`, `keuangan/arus-kas`, `pengaturan/audit-trail`

**Dampak saat ini:** tidak ada bug — input native berfungsi dan menyimpan ISO
dengan benar. Yang hilang adalah konsistensi: tampilan berbeda dari 48 instance
`DatePicker` di modul lain, tidak ikut tema Sunset Peach, dan tidak mendapat
dropdown bulan/tahun dari UI-1.

**Penghambat teknis:** dua instance di `ManualJournalForm.tsx` dan
`QuickJournalForm.tsx` adalah input **controlled** (`value`/`onChange`) di dalam
baris jurnal dinamis, sedangkan `DatePicker` saat ini uncontrolled — hanya
menerima `defaultValue`. Migrasi keduanya menuntut penambahan API controlled ke
`DatePicker` lebih dulu, dan itu menyentuh komponen yang dipakai 48 tempat.

**Catatan kehati-hatian:** modul Keuangan setara sensitif dengan payroll (lihat
`fase3-keuangan-brief-claude-code.md`). Migrasi ini menyentuh form jurnal, AR,
AP, dan aset tetap — perlakukan dengan standar regresi yang sama: baca kode
dulu, baseline dulu, buktikan tidak ada perubahan perilaku penyimpanan tanggal.
