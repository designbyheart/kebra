import { cn } from "@/lib/utils";
import { PILL, WARRANTY_CLASS, WARRANTY_LABEL, type WarrantyStatus } from "@/lib/ui/job-status";

export type WarrantyPillProps = { status: WarrantyStatus; className?: string; children?: React.ReactNode };

/** Warranty status pill; children override the default label. */
export function WarrantyPill({ status, className, children }: WarrantyPillProps) {
  return <span className={cn(PILL, "h-6 px-2 text-xs", WARRANTY_CLASS[status], className)}>{children ?? WARRANTY_LABEL[status]}</span>;
}
