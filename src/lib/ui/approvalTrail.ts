import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { TrailStep, TrailStepStatus } from "@/components/ui/TrailStepper";

type ApprovalStepRow = {
  id: string;
  stepOrder: number;
  approverId: string | null;
  status: string;
  catatan: string | null;
  approvedAt: Date | null;
};

// approval_steps semua dibuat di depan (default status "pending"), jadi "pending"
// di DB bisa berarti "sedang menunggu approval sekarang" ATAU "belum giliran" —
// dibedakan lewat firstPendingStep (jenjang pending PALING AWAL yang benar-benar aktif).
export function approvalStepsToTrail(
  steps: ApprovalStepRow[],
  userList: { id: string; fullName: string }[]
): TrailStep[] {
  const firstPendingId = steps.find((s) => s.status === "pending")?.id;

  return steps.map((step) => {
    const approver = userList.find((u) => u.id === step.approverId);
    const label = approver ? `Jenjang ${step.stepOrder} — ${approver.fullName}` : `Jenjang ${step.stepOrder}`;

    let status: TrailStepStatus;
    if (step.status === "approved") status = "done";
    else if (step.status === "rejected") status = "rejected";
    else status = step.id === firstPendingId ? "pending" : "upcoming";

    let caption: string | undefined;
    if ((status === "done" || status === "rejected") && step.approvedAt) {
      caption = format(step.approvedAt, "d MMM", { locale: idLocale });
    } else if (status === "pending") {
      caption = "Berjalan";
    }

    return { id: step.id, label, description: step.catatan ?? undefined, caption, status };
  });
}
