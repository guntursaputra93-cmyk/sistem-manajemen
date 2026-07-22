"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "./Toast";

// Toast sukses global: dipasang sekali di layout dashboard. Saat halaman dimuat
// dengan ?success= (pola redirect semua server action), tampilkan toast lalu
// bersihkan param dari URL — banner hijau statis di halaman ikut hilang saat
// re-render, jadi tidak dobel. Param error TIDAK disentuh (tetap banner, karena
// butuh perhatian dan dipakai membuka ulang drawer form).
export function FlashToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const lastShown = useRef<string | null>(null);

  useEffect(() => {
    const success = searchParams.get("success");
    if (!success) return;
    const key = `${pathname}?success=${success}`;
    if (lastShown.current === key) return;
    lastShown.current = key;

    showToast(success === "1" ? "Berhasil disimpan." : success);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("success");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }, [searchParams, pathname, router, showToast]);

  return null;
}
