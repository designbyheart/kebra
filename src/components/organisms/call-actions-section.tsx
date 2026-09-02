import type { CallDetail as CallDetailData } from "@/app/calls/data";
import { SectionTitle } from "@/components/atoms/section-title";
import { CallActionItem } from "@/components/molecules/call-action-item";
import { CallTaskItem } from "@/components/molecules/call-task-item";

export type CallActionsSectionProps = { call: CallDetailData };

/** "Actions taken" list plus the follow-up tasks created from this call. */
export function CallActionsSection({ call }: CallActionsSectionProps) {
  return (
    <div>
      <SectionTitle aside={<span className="text-xs text-muted-foreground">{call.actions.length}</span>}>Actions taken</SectionTitle>
      {call.actions.length === 0 && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Nothing was changed during this call.</p>}
      {call.actions.length > 0 && (
        <ol className="divide-y rounded-lg border bg-card">
          {call.actions.map((a) => (
            <CallActionItem key={a.id} action={a} />
          ))}
        </ol>
      )}
      {call.tasks.length > 0 && (
        <ul className="mt-2 space-y-1">
          {call.tasks.map((t) => (
            <CallTaskItem key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
