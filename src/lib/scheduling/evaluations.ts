// 6 aspek default sesuai SOP Pemeliharaan Kompetensi Auditor, skala 1-4 —
// di-hardcode (bukan tabel config terpisah), konsisten dgn keputusan spesifikasi
// Fase 4 Bagian 7: scores jsonb sengaja fleksibel, jangan dinormalisasi.
export const DEFAULT_WITNESSED_AUDIT_ASPECTS = [
  "Teknik Audit",
  "Objektivitas",
  "Komunikasi",
  "Klasifikasi Temuan",
  "Manajemen Waktu",
  "Dokumentasi",
] as const;

// 6 aspek default evaluasi kinerja (FR-04) — top-down oleh Ketua Tim/Technical
// Manager, beda konteks dari witnessed audit (FR-03) di atas tapi pola sama.
export const DEFAULT_PERFORMANCE_EVALUATION_ASPECTS = [
  "Persiapan",
  "Kepatuhan Jadwal",
  "Kualitas Laporan",
  "Kerja Sama Tim",
  "Profesionalisme",
  "Ketepatan Waktu",
] as const;

export const SCORE_SCALE = [1, 2, 3, 4] as const;

export type EvaluationScore = { aspect: string; score: number };

export function parseScores(raw: unknown): EvaluationScore[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is EvaluationScore =>
      typeof item === "object" && item !== null && typeof (item as EvaluationScore).aspect === "string" && typeof (item as EvaluationScore).score === "number"
  );
}

export function averageScore(scores: EvaluationScore[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
}
