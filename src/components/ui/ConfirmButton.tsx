"use client";

import { ReactNode } from "react";

// Tombol submit dengan konfirmasi native — dipakai untuk aksi destruktif (mis. hapus
// milestone) di dalam <form action={serverAction}> biasa, tanpa mengubah pola form
// server-action yang sudah ada. Kalau user batal, submit dicegah.
export function ConfirmButton({
  children,
  confirmText,
  className = "",
}: {
  children: ReactNode;
  confirmText: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
