import Link from "next/link";
import type { WarrantyEvidence } from "@/domain/warranty";

export type EvidenceItemProps = { evidence: WarrantyEvidence };

/** One warranty evidence row: kind chip, text and a link to the job. */
export function EvidenceItem({ evidence: ev }: EvidenceItemProps) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 rounded bg-muted px-1 font-mono text-xs text-muted-foreground ring-1 ring-inset ring-border">{ev.kind.replace("_", " ")}</span>
      <span>
        {ev.text}{" "}
        <Link href={`/jobs/${ev.job_id}`} className="text-muted-foreground hover:underline">
          ↗
        </Link>
      </span>
    </li>
  );
}
