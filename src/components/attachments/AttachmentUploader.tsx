"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AttachmentSummary = {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string | Date;
};

/**
 * Komponen generik dipakai bersama semua entity yang punya lampiran (surat
 * masuk, surat keluar, nota dinas, dokumen) — lihat spesifikasi Bagian 2.1,
 * supaya upload/unduh tidak diduplikasi per modul.
 */
export function AttachmentUploader({
  entityType,
  entityId,
  attachments,
}: {
  entityType: "surat_masuk" | "surat_keluar" | "nota_dinas" | "dokumen";
  entityId: string;
  attachments: AttachmentSummary[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityType", entityType);
    formData.append("entityId", entityId);

    setUploading(true);
    const res = await fetch("/api/attachments", { method: "POST", body: formData });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Gagal upload file.");
      return;
    }

    form.reset();
    router.refresh();
  }

  async function handleDownload(id: string) {
    const res = await fetch(`/api/attachments/${id}`);
    if (!res.ok) {
      setError("Gagal membuat link unduh.");
      return;
    }
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 && <p className="text-sm text-gray-400 italic">Belum ada lampiran.</p>}
      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span>
                {a.fileName} <span className="text-gray-400">({(a.fileSize / 1024).toFixed(0)} KB)</span>
              </span>
              <button type="button" onClick={() => handleDownload(a.id)} className="text-blue-600 hover:underline text-xs">
                Unduh
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleUpload} className="flex items-center gap-3">
        <input name="file" type="file" accept="application/pdf" required className="text-sm" />
        <button
          type="submit"
          disabled={uploading}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
        >
          {uploading ? "Mengunggah..." : "Unggah PDF"}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
