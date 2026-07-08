import { ReactNode } from "react";

export function Card({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 ${className}`}>
      {title && <h2 className="font-display text-lg font-semibold text-ink mb-1">{title}</h2>}
      {description && <p className="text-sm text-ink-muted mb-4">{description}</p>}
      {children}
    </div>
  );
}
