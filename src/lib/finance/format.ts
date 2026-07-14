/** "Rp 1.234.567,00" — dipakai di semua halaman keuangan yang menampilkan nominal. */
export function formatRupiah(v: string | number): string {
  return `Rp ${Number(v).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
