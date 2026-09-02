import Link from "next/link";
import type { Equipment } from "@/domain/warranty";
import { equipmentTitle, installedLabel } from "@/lib/ui/customer-view";

export type EquipmentItemProps = {
  equipment: Equipment;
  /** Marks the line that the warranty status was derived from. */
  isWarrantyBasis: boolean;
};

/** One structured equipment line: title, SEER, model, install date and source job. */
export function EquipmentItem({ equipment: e, isWarrantyBasis }: EquipmentItemProps) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">{equipmentTitle(e)}</span>
        {Boolean(e.seer) && <span className="text-xs text-muted-foreground">{e.seer} SEER</span>}
        {e.model && <span className="font-mono text-xs text-muted-foreground">{e.model}</span>}
        {isWarrantyBasis && (
          <span className="inline-flex h-4 items-center rounded bg-emerald-50 px-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900">
            warranty basis
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {installedLabel(e.installed_at)} ·{" "}
        <Link href={`/jobs/${e.source_job_id}`} className="hover:underline">
          job
        </Link>
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground/80" title={e.line}>
        {e.line}
      </div>
    </li>
  );
}
