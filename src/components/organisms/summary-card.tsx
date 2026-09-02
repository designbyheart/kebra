import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { summaryParagraphs } from "@/lib/ui/dossier-summary";
import { fmtDateTime } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export type SummaryCardProps = {
  title?: string;
  summary: string | null;
  fallback: string | null;
  generatedAt?: Date | string | null;
  model?: string | null;
  className?: string;
};

/**
 * The dossier summary card. `summary_md` from W1-D is plain spoken sentences
 * (no markdown symbols by prompt design), so paragraphs are enough; when it is
 * missing we show the deterministic sentence the agent would speak instead.
 */
export function SummaryCard({ title = "Summary", summary, fallback, generatedAt, model, className }: SummaryCardProps) {
  const text = summary?.trim() || fallback?.trim() || null;
  const paragraphs = summaryParagraphs(text);
  return (
    <Card size="sm" className={cn(className)}>
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2">
          {title}
          {summary && (
            <span className="inline-flex h-5 items-center gap-1 rounded-md bg-teal-600 px-1.5 text-xs font-medium text-white ring-1 ring-inset ring-teal-700 dark:bg-teal-500 dark:ring-teal-400">
              <Sparkles className="size-3" />
              Agent brief
            </span>
          )}
          {!summary && <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">From records</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm leading-relaxed">
        {paragraphs.length > 0 && paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        {paragraphs.length === 0 && <p className="text-muted-foreground">Nothing on file yet.</p>}
        {summary && generatedAt && (
          <p className="pt-1 text-xs text-muted-foreground">
            Generated {fmtDateTime(generatedAt)}
            {model && ` · ${model}`}. Structured facts below come straight from jobs, notes and invoices.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
