import Link from "next/link";
import { ArrowRightLeft, ArrowUpRight, CalendarPlus, ClipboardList, FileText, Phone, StickyNote, UserCheck, XCircle } from "lucide-react";
import { AgentBotChip } from "@/components/atoms/agent-bot-chip";
import { ACTION_TONE, type ActionItem, type ActionKind } from "@/lib/ui/call-derive";
import { formatTimeET } from "@/lib/time";
import { cn } from "@/lib/utils";

const ACTION_ICON: Record<ActionKind, typeof CalendarPlus> = {
  booking: CalendarPlus,
  reschedule: CalendarPlus,
  cancellation: XCircle,
  note: StickyNote,
  task: ClipboardList,
  identified: UserCheck,
  transfer: ArrowRightLeft,
  phone: Phone,
  other: FileText,
};

export type CallActionItemProps = { action: ActionItem };

/** One "action taken" row; a link when the action points at a job / customer / task. */
export function CallActionItem({ action }: CallActionItemProps) {
  const Icon = ACTION_ICON[action.kind];
  const body = (
    <>
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", ACTION_TONE[action.kind])} />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug">{action.label}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {action.agent && <AgentBotChip />}
          {!action.agent && <span>{action.actorLabel}</span>}
          <span>{formatTimeET(action.ts)}</span>
          {action.fixture && <span className="rounded bg-muted px-1 font-mono">fixture</span>}
        </div>
      </div>
      {action.href && <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />}
    </>
  );
  if (action.href) {
    return (
      <li>
        <Link href={action.href} className="flex items-start gap-2 p-2.5 hover:bg-muted/60">
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <div className="flex items-start gap-2 p-2.5">{body}</div>
    </li>
  );
}
