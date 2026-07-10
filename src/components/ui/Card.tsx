import { ReactNode } from "react";

export function Card({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface rounded-[14px] shadow-[0_2px_10px_rgba(51,57,59,0.05)] px-[18px] py-3.5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-1">
          {title && <h2 className="font-display text-[12.5px] font-bold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {description && <p className="text-[11px] text-ink-muted mb-3">{description}</p>}
      {children}
    </div>
  );
}
