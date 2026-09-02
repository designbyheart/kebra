import type { CallDetail as CallDetailData } from "@/app/calls/data";
import { SectionTitle } from "@/components/atoms/section-title";
import { CallPromiseItem } from "@/components/molecules/call-promise-item";
import { promisesEmptyMessage } from "@/lib/ui/call-derive";

export type CallPromisesSectionProps = { call: CallDetailData; live: boolean };

/** "Promises made" list, or the analysis-pending copy. */
export function CallPromisesSection({ call, live }: CallPromisesSectionProps) {
  const analyzed = Boolean(call.summary) || call.promises.length > 0;
  return (
    <div>
      <SectionTitle aside={<span className="text-xs text-muted-foreground">{call.promises.length || ""}</span>}>Promises made</SectionTitle>
      {call.promises.length === 0 && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{promisesEmptyMessage(live, analyzed)}</p>}
      {call.promises.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {call.promises.map((p, i) => (
            <CallPromiseItem key={i} promise={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
