import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentBotChipProps = { label?: string; className?: string };

/** Agent chip with the bot icon, used across the Calls pages. */
export function AgentBotChip({ label = "Agent", className }: AgentBotChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full bg-teal-50 px-1.5 text-xs font-medium text-teal-800 ring-1 ring-teal-600/20 ring-inset dark:bg-teal-950/40 dark:text-teal-300",
        className,
      )}
    >
      <Bot className="size-3" />
      {label}
    </span>
  );
}
