import { cn } from "@/lib/utils";

const LABEL = {
  /** Job page: uppercase tracking label. */
  upper: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
  /** Cancellation card: plain muted label. */
  plain: "text-xs text-muted-foreground",
} as const;

export type FactProps = {
  label: string;
  children: React.ReactNode;
  variant?: keyof typeof LABEL;
  className?: string;
};

/** One <dt>/<dd> pair inside a definition grid. */
export function Fact({ label, children, variant = "upper", className }: FactProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className={LABEL[variant]}>{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}
