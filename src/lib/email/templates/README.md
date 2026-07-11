# Template email

Komponen `@react-email/components`, dipanggil lewat `sendEmail({ react: <Template ... /> })` di `../client.ts`.

- `PasswordResetEmail.tsx` — dipakai fitur lupa password.

Rencana masa depan (belum dibangun, di luar cakupan saat ini):
- `CompetencyExpiryReminderEmail.tsx` — reminder kompetensi mendekati kedaluwarsa.
- `ContractRenewalReminderEmail.tsx` — reminder kontrak mendekati akhir masa berlaku.
- `ApprovalNotificationEmail.tsx` — notifikasi approval surat/cuti dsb.

Nambah template baru = bikin 1 file di sini + panggil `sendEmail()` yang sudah ada. Tidak perlu ubah infrastrukturnya.
