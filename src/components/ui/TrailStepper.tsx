"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

export type TrailStepStatus = "done" | "pending" | "rejected" | "upcoming";

export type TrailStep = {
  id: string;
  label: string;
  description?: string;
  status: TrailStepStatus;
};

// Kontras dicek (Bagian 6 spesifikasi desain): ikon putih butuh warna "deep" yang
// cukup gelap sebagai latar (sage/destructive polos terlalu terang utk capai 4.5:1).
// Border pending pakai powder-blue-deep dengan alasan sama (powder-blue polos di
// atas putih cuma ~1.8:1, gagal syarat non-text 3:1).
const DOT_STYLES: Record<TrailStepStatus, string> = {
  done: "bg-sage-deep border-sage-deep",
  pending: "bg-surface border-powder-blue-deep motion-safe:animate-trail-pulse",
  rejected: "bg-destructive border-destructive",
  upcoming: "bg-surface border-ink-muted/30",
};

function TrailDot({ status }: { status: TrailStepStatus }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${DOT_STYLES[status]}`}>
      {status === "done" && <Check size={14} strokeWidth={3} className="text-surface" aria-hidden="true" />}
      {status === "rejected" && <X size={14} strokeWidth={3} className="text-surface" aria-hidden="true" />}
    </span>
  );
}

// Garis solid utk yang sudah lewat (done/rejected), putus-putus utk yang akan
// datang (pending/upcoming) — Bagian 3 spesifikasi desain.
function isPast(status: TrailStepStatus): boolean {
  return status === "done" || status === "rejected";
}

function StepTooltip({ description }: { description: string }) {
  return (
    <div className="absolute z-10 w-56 rounded-lg bg-surface p-3 text-xs text-ink shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
      {description}
    </div>
  );
}

// Titik jadi <button> asli (bukan <div onClick>) kalau ada instruksi yg bisa
// diungkap — supaya bisa dijangkau/dipicu keyboard (Bagian 6 spesifikasi desain:
// semua elemen interaktif wajib ada focus state & bisa dioperasikan keyboard).
function InteractiveDot({
  step,
  open,
  onToggle,
  onHoverOpen,
  onHoverClose,
  tooltipPosition,
}: {
  step: TrailStep;
  open: boolean;
  onToggle: () => void;
  onHoverOpen: () => void;
  onHoverClose: () => void;
  tooltipPosition: "below" | "right";
}) {
  const tooltipClass = tooltipPosition === "below" ? "absolute top-8 left-1/2 -translate-x-1/2" : "absolute left-8 top-0";

  if (!step.description) {
    return (
      <div className="relative">
        <TrailDot status={step.status} />
      </div>
    );
  }

  return (
    <div className="relative" onMouseEnter={onHoverOpen} onMouseLeave={onHoverClose}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${step.label} — lihat detail`}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-powder-blue-deep focus-visible:ring-offset-2"
      >
        <TrailDot status={step.status} />
      </button>
      {open && (
        <div className={tooltipClass}>
          <StepTooltip description={step.description} />
        </div>
      )}
    </div>
  );
}

export function TrailStepper({
  steps,
  orientation = "vertical",
}: {
  steps: TrailStep[];
  orientation?: "vertical" | "horizontal";
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  function toggle(step: TrailStep) {
    if (!step.description) return;
    setOpenId((cur) => (cur === step.id ? null : step.id));
  }

  if (orientation === "horizontal") {
    return (
      <div className="flex items-start">
        {steps.map((step, i) => (
          <div key={step.id} className={i === steps.length - 1 ? "flex flex-col items-center" : "flex flex-1 flex-col items-center"}>
            <div className="flex w-full items-center">
              <InteractiveDot
                step={step}
                open={openId === step.id}
                onToggle={() => toggle(step)}
                onHoverOpen={() => step.description && setOpenId(step.id)}
                onHoverClose={() => setOpenId((cur) => (cur === step.id ? null : cur))}
                tooltipPosition="below"
              />
              {i < steps.length - 1 && (
                <div className={`h-0 flex-1 border-t-2 ${isPast(step.status) ? "border-solid border-ink-muted/40" : "border-dashed border-ink-muted/30"}`} />
              )}
            </div>
            <p className="mt-2 max-w-24 text-center text-xs font-medium text-ink">{step.label}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => (
        <div key={step.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <InteractiveDot
              step={step}
              open={openId === step.id}
              onToggle={() => toggle(step)}
              onHoverOpen={() => step.description && setOpenId(step.id)}
              onHoverClose={() => setOpenId((cur) => (cur === step.id ? null : cur))}
              tooltipPosition="right"
            />
            {i < steps.length - 1 && (
              <div className={`my-1 w-0 flex-1 border-l-2 ${isPast(step.status) ? "border-solid border-ink-muted/40" : "border-dashed border-ink-muted/30"}`} />
            )}
          </div>
          <div className="pb-6">
            <p className="text-sm font-medium text-ink">{step.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
