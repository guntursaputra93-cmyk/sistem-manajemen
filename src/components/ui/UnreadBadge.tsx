// dusty-rose-deep (bukan dusty-rose polos) — teks putih di atas dusty-rose polos
// cuma ~2:1, gagal syarat kontras (Bagian 6 spesifikasi desain).
export function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-dusty-rose-deep px-1.5 py-0.5 text-xs font-medium leading-none text-white">
      {count}
    </span>
  );
}
