import type { TrailStep, TrailStepStatus } from "@/components/ui/TrailStepper";

type ApprovalStepRow = {
  id: string;
  stepOrder: number;
  approverId: string | null;
  status: string;
  catatan: string | null;
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

    return { id: step.id, label, description: step.catatan ?? undefined, status };
  });
}
