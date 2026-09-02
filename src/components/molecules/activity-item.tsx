import Link from "next/link";
import { Phone } from "lucide-react";
import { AgentTag } from "@/components/atoms/agent-tag";
import { RelativeTime } from "@/components/atoms/relative-time";
import { actorLabelOf, type LiveEvent } from "@/lib/use-live-events";
import { cn } from "@/lib/utils";

const ACTOR_DOT: Record<LiveEvent["actor"], string> = {
  agent: "bg-teal-500",
  office: "bg-blue-500",
  system: "bg-gray-400",
};

function summaryOf(e: LiveEvent): string {
  const s = e.payload?.summary;
  if (typeof s === "string") return s;
  return e.type;
}

export type ActivityItemProps = {
  event: LiveEvent;
  /** Client clock (`null` before hydration → absolute time). */
  now: Date | null;
  /** Just arrived over the feed: highlighted for a few seconds. */
  fresh: boolean;
};

/** One event row in the activity strip. */
export function ActivityItem({ event: e, now, fresh }: ActivityItemProps) {
  return (
    <li className={cn("flex gap-2 px-3 py-2 text-sm transition-colors", fresh && "animate-in fade-in slide-in-from-top-1 bg-teal-50 duration-500 dark:bg-teal-950/30")}>
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", ACTOR_DOT[e.actor] ?? "bg-gray-400")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{actorLabelOf(e)}</span>
          {e.actor === "agent" && <AgentTag size="compact" />}
          <RelativeTime iso={e.ts} now={now} className="ml-auto shrink-0" />
        </div>
        <p className="line-clamp-3 break-words text-muted-foreground">{summaryOf(e)}</p>
        {e.callId && (
          <Link href={`/calls/${encodeURIComponent(e.callId)}`} className="mt-0.5 inline-flex items-center gap-1 text-sm text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
            <Phone className="size-3" /> View call
          </Link>
        )}
      </div>
    </li>
  );
}
