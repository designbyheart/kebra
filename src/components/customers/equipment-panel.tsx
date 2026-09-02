import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Equipment, WarrantyEvidence } from "@/domain/warranty";
import { fmtDate } from "@/components/jobs/format";

function title(e: Equipment): string {
  const bits = [e.brand, e.tonnage ? `${e.tonnage} ton` : null, e.kind].filter(Boolean).join(" ");
  return bits ? bits[0].toUpperCase() + bits.slice(1) : e.line;
}

/** Equipment on site (from invoice material lines) plus the warranty evidence trail. */
export function EquipmentPanel({
  equipment,
  dossierEquipment,
  evidence,
  installJobId,
}: {
  equipment: Equipment[];
  /** W1-D's free-text equipment strings, used only when no structured lines exist */
  dossierEquipment?: string[];
  evidence: WarrantyEvidence[];
  installJobId?: string;
}) {
  const hasStructured = equipment.length > 0;
  const fallback = !hasStructured && dossierEquipment && dossierEquipment.length > 0 ? dossierEquipment : [];
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-sm">
          Equipment
          <span className="ml-2 text-xs font-normal text-muted-foreground">{hasStructured ? `${equipment.length} on file` : fallback.length ? "from the brief" : "none on file"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasStructured ? (
          <ul className="divide-y">
            {equipment.map((e, i) => (
              <li key={`${e.source_job_id}-${i}`} className="py-2 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{title(e)}</span>
                  {e.seer ? <span className="text-xs text-muted-foreground">{e.seer} SEER</span> : null}
                  {e.model ? <span className="font-mono text-xs text-muted-foreground">{e.model}</span> : null}
                  {e.source_job_id === installJobId ? (
                    <span className="inline-flex h-4 items-center rounded bg-emerald-50 px-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900">
                      warranty basis
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {e.installed_at ? `Installed ${fmtDate(e.installed_at)}` : "Install date unknown"} ·{" "}
                  <Link href={`/jobs/${e.source_job_id}`} className="hover:underline">
                    job
                  </Link>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground/80" title={e.line}>
                  {e.line}
                </div>
              </li>
            ))}
          </ul>
        ) : fallback.length ? (
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {fallback.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No equipment lines on any invoice here. Repairs only, or the install predates our records.</p>
        )}

        {evidence.length ? (
          <details className="group">
            <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              Warranty evidence ({evidence.length})
              <span className="ml-1 group-open:hidden">▸</span>
              <span className="ml-1 hidden group-open:inline">▾</span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-xs">
              {evidence.map((ev, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 rounded bg-muted px-1 font-mono text-xs text-muted-foreground ring-1 ring-inset ring-border">{ev.kind.replace("_", " ")}</span>
                  <span>
                    {ev.text}{" "}
                    <Link href={`/jobs/${ev.job_id}`} className="text-muted-foreground hover:underline">
                      ↗
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
