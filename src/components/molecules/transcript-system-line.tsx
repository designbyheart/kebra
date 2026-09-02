import { ArrowRightLeft } from "lucide-react";
import { formatOffset } from "@/lib/ui/call-derive";

export type TranscriptSystemLineProps = { text: string; t: number };

/** Centered muted chip for a system / transfer line in the transcript. */
export function TranscriptSystemLine({ text, t }: TranscriptSystemLineProps) {
  return (
    <div className="flex justify-center">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={formatOffset(t)}>
        <ArrowRightLeft className="size-3 shrink-0" />
        <span className="truncate">{text}</span>
      </span>
    </div>
  );
}
