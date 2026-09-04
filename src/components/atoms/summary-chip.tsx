import { cn } from "@/lib/utils";

const TONE = {
  neutral: "bg-muted text-foreground",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  blue: "bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100",
  red: "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
  violet: "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
} as const;

const BASE = "inline-flex h-5 items-center rounded-full px-2 font-medium tabular-nums";

export type SummaryChipProps = {
  children: React.ReactNode;
  tone?: keyof typeof TONE;
  /** When given the chip becomes a filter toggle. */
  onClick?: () => void;
  /** Only meaningful with `onClick`: the chip's slice is the one on screen. */
  active?: boolean;
  title?: string;
};

/** Count chip under the board title ("12 jobs", "2 in progress"), optionally a filter toggle. */
export function SummaryChip({ children, tone = "neutral", onClick, active = false, title }: SummaryChipProps) {
  if (!onClick) {
    return <span className={cn(BASE, TONE[tone])}>{children}</span>;
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        BASE,
        TONE[tone],
        "cursor-pointer transition-shadow hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-125",
        active && "ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
    >
      {children}
    </button>
  );
}
