import { eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { outgoingLetters, companies, departments } from "@/drizzle/schema";
import { getNextSequenceNumber } from "./numbering";
import { initializeApprovalSteps, getApprovalStatus, recordApprovalDecision, type ActingUser } from "@/lib/approval/flows";

export class OutgoingLetterError extends Error {}

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function romanMonth(month: number): string {
  return ROMAN_MONTHS[month - 1];
}

const CATEGORY_JENIS_CODE: Record<"surat_keluar" | "nota_dinas", string> = {
  surat_keluar: "EXT",
  nota_dinas: "ND",
};

/**
 * Format [urut]/[dept_code]/[company_code]/[jenis]/[bulan_romawi]/[tahun] —
 * lihat spesifikasi Bagian 2.3. Urut di-pad 3 digit (konvensi umum penomoran
 * surat resmi Indonesia; spek tidak menentukan lebar padding secara eksplisit).
 */
function buildLetterNumber(params: {
  urut: number;
  deptCode: string;
  companyCode: string;
  category: "surat_keluar" | "nota_dinas";
  finalizedAt: Date;
}): string {
  const urutStr = String(params.urut).padStart(3, "0");
  const jenis = CATEGORY_JENIS_CODE[params.category];
  const month = romanMonth(params.finalizedAt.getMonth() + 1);
  const year = params.finalizedAt.getFullYear();
  return `${urutStr}/${params.deptCode}/${params.companyCode}/${jenis}/${month}/${year}`;
}

/**
 * Generate nomor resmi & tandai disetujui — HANYA dipanggil setelah seluruh
 * approval_steps 'approved' (lihat spesifikasi: nomor tidak boleh bolong
 * akibat draft batal/ditolak, jadi digenerate paling akhir, bukan saat draft).
 */
async function finalizeLetterNumber(
  tx: typeof Db,
  params: { companyId: string; letterId: string }
): Promise<void> {
  const [letter] = await tx.select().from(outgoingLetters).where(eq(outgoingLetters.id, params.letterId));
  if (!letter) throw new OutgoingLetterError("Surat tidak ditemukan.");
  if (letter.letterNumber) return; // sudah pernah difinalisasi, idempotent

  const [company] = await tx.select().from(companies).where(eq(companies.id, params.companyId));
  const [department] = await tx.select().from(departments).where(eq(departments.id, letter.departmentId));

  if (!company?.code) {
    throw new OutgoingLetterError("Kode perusahaan belum diatur — atur dulu di halaman Pengaturan.");
  }
  if (!department?.code) {
    throw new OutgoingLetterError("Kode departemen belum diatur — atur dulu di halaman Pengaturan.");
  }

  const urut = await getNextSequenceNumber(tx, {
    companyId: params.companyId,
    departmentId: letter.departmentId,
    sequenceType: letter.letterCategory,
  });

  const finalizedAt = new Date();
  const letterNumber = buildLetterNumber({
    urut,
    deptCode: department.code,
    companyCode: company.code,
    category: letter.letterCategory,
    finalizedAt,
  });

  await tx
    .update(outgoingLetters)
    .set({ letterNumber, status: "disetujui", finalizedAt, updatedAt: finalizedAt })
    .where(eq(outgoingLetters.id, params.letterId));
}

/**
 * Ajukan draft untuk approval. Kalau admin belum konfigurasi approval_flows
 * sama sekali untuk jenis ini (0 jenjang), langsung finalize — konsisten
 * dengan getApprovalStatus() yang menganggap 0 syarat = otomatis lolos.
 */
export async function submitForApproval(
  tx: typeof Db,
  params: { companyId: string; letterId: string }
): Promise<void> {
  const [letter] = await tx.select().from(outgoingLetters).where(eq(outgoingLetters.id, params.letterId));
  if (!letter) throw new OutgoingLetterError("Surat tidak ditemukan.");
  if (letter.status !== "draft") throw new OutgoingLetterError("Surat ini bukan draft.");

  await initializeApprovalSteps(tx, {
    companyId: params.companyId,
    entityType: letter.letterCategory,
    entityId: letter.id,
    jenisKey: letter.jenisKey,
    departmentId: letter.departmentId,
  });

  const status = await getApprovalStatus(tx, { entityType: letter.letterCategory, entityId: letter.id });

  if (status.allApproved) {
    await finalizeLetterNumber(tx, { companyId: params.companyId, letterId: letter.id });
  } else {
    await tx
      .update(outgoingLetters)
      .set({ status: "menunggu_approval", updatedAt: new Date() })
      .where(eq(outgoingLetters.id, letter.id));
  }
}

/** Approve/reject 1 jenjang, lalu update status outgoing_letters sesuai hasilnya. */
export async function decideOutgoingLetterApproval(
  tx: typeof Db,
  params: {
    companyId: string;
    letterId: string;
    stepOrder: number;
    actingUser: ActingUser;
    decision: "approved" | "rejected";
    catatan?: string | null;
  }
): Promise<void> {
  const [letter] = await tx.select().from(outgoingLetters).where(eq(outgoingLetters.id, params.letterId));
  if (!letter) throw new OutgoingLetterError("Surat tidak ditemukan.");

  await recordApprovalDecision(tx, {
    companyId: params.companyId,
    entityType: letter.letterCategory,
    entityId: letter.id,
    stepOrder: params.stepOrder,
    actingUser: params.actingUser,
    decision: params.decision,
    catatan: params.catatan,
  });

  if (params.decision === "rejected") {
    await tx
      .update(outgoingLetters)
      .set({ status: "ditolak", updatedAt: new Date() })
      .where(eq(outgoingLetters.id, letter.id));
    return;
  }

  const status = await getApprovalStatus(tx, { entityType: letter.letterCategory, entityId: letter.id });
  if (status.allApproved) {
    await finalizeLetterNumber(tx, { companyId: params.companyId, letterId: letter.id });
  }
}

export async function markOutgoingLetterAsSent(tx: typeof Db, params: { letterId: string }): Promise<void> {
  const [letter] = await tx.select().from(outgoingLetters).where(eq(outgoingLetters.id, params.letterId));
  if (!letter) throw new OutgoingLetterError("Surat tidak ditemukan.");
  if (letter.status !== "disetujui") throw new OutgoingLetterError("Surat harus berstatus disetujui dulu sebelum dikirim.");

  await tx
    .update(outgoingLetters)
    .set({ status: "terkirim", updatedAt: new Date() })
    .where(eq(outgoingLetters.id, params.letterId));
}
