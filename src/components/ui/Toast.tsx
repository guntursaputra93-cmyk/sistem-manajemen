"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { X } from "lucide-react";
import type { BadgeVariant } from "./Badge";

type ToastItem = { id: number; message: string; variant: BadgeVariant };

type ToastContextValue = {
  showToast: (message: string, variant?: BadgeVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Konfirmasi memakai kata kerja yang sama dengan tombol pemicunya (Bagian 5
// spesifikasi desain), mis. tombol "Kirim untuk Persetujuan" -> showToast("Terkirim untuk persetujuan").
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam <ToastProvider>.");
  return ctx;
}

let nextToastId = 0;
const AUTO_DISMISS_MS = 4000;

// Latar solid + teks warna "-deep" milik sendiri gagal kontras (mis. sage bg +
// sage-deep text cuma ~3.3:1) — pola aman yang sama dipakai Sidebar: teks ink
// gelap di atas latar pastel manapun, kecuali destructive yang sudah gelap sendiri.
const VARIANT_STYLES: Record<BadgeVariant, string> = {
  sage: "bg-sage text-ink",
  "powder-blue": "bg-powder-blue text-ink",
  "dusty-rose": "bg-dusty-rose text-ink",
  destructive: "bg-destructive text-white",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: BadgeVariant = "sage") => {
      const id = nextToastId++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${VARIANT_STYLES[t.variant]}`}
          >
            {t.message}
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Tutup notifikasi"
              className="rounded-full p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
