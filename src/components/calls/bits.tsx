import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pulsing amber dot for live calls. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-label="Live">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
      <span className="relative inline-flex h-full w-full rounded-full bg-amber-500" />
    </span>
  );
}

/** The one accent in the UI: teal marks the agent. */
export function AgentBadge({ label = "Agent", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full bg-teal-50 px-1.5 text-[11px] font-medium text-teal-800 ring-1 ring-teal-600/20 ring-inset dark:bg-teal-950/40 dark:text-teal-300",
        className,
      )}
    >
      <Bot className="size-3" />
      {label}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {aside}
    </div>
  );
}
