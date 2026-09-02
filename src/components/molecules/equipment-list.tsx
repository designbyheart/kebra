import type { Equipment } from "@/domain/warranty";
import { EquipmentItem } from "./equipment-item";

export type EquipmentListProps = {
  equipment: Equipment[];
  /** Free-text lines from the brief, shown only when there are no structured lines. */
  fallback: string[];
  installJobId?: string;
};

/** Structured equipment lines, else the brief's free text, else the empty state. */
export function EquipmentList({ equipment, fallback, installJobId }: EquipmentListProps) {
  if (equipment.length > 0) {
    return (
      <ul className="divide-y">
        {equipment.map((e, i) => (
          <EquipmentItem key={`${e.source_job_id}-${i}`} equipment={e} isWarrantyBasis={e.source_job_id === installJobId} />
        ))}
      </ul>
    );
  }
  if (fallback.length > 0) {
    return (
      <ul className="list-disc space-y-1 pl-4 text-sm">
        {fallback.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm text-muted-foreground">No equipment lines on any invoice here. Repairs only, or the install predates our records.</p>;
}
