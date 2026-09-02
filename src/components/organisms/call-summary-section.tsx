import type { CallDetail as CallDetailData } from "@/app/calls/data";
import { SectionTitle } from "@/components/atoms/section-title";
import { summaryEmptyMessage } from "@/lib/ui/call-derive";

export type CallSummarySectionProps = { call: CallDetailData; live: boolean };

/** The post-call summary paragraph, or the pending copy. */
export function CallSummarySection({ call, live }: CallSummarySectionProps) {
  return (
    <div>
      <SectionTitle>Summary</SectionTitle>
      {call.summary && <p className="rounded-lg border bg-card p-3 text-sm leading-relaxed">{call.summary}</p>}
      {!call.summary && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{summaryEmptyMessage(live)}</p>}
    </div>
  );
}
