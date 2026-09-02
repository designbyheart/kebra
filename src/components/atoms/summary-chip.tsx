import { cn } from "@/lib/utils";

const TONE = {
  neutral: "bg-muted text-foreground",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  blue: "bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100",
  red: "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
  violet: "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
} as const;

export type SummaryChipProps = { children: React.ReactNode; tone?: keyof typeof TONE };

/** Count chip under the board title ("12 jobs", "2 in progress"). */
export function SummaryChip({ children, tone = "neutral" }: SummaryChipProps) {
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 font-medium tabular-nums", TONE[tone])}>{children}</span>;
}
