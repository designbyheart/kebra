import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { EquipmentList } from "@/components/molecules/equipment-list";
import { EvidenceItem } from "@/components/molecules/evidence-item";
import type { Equipment, WarrantyEvidence } from "@/domain/warranty";
import { equipmentCaption, equipmentFallback } from "@/lib/ui/customer-view";

export type EquipmentPanelProps = {
  equipment: Equipment[];
  /** W1-D's free-text equipment strings, used only when no structured lines exist */
  dossierEquipment?: string[];
  evidence: WarrantyEvidence[];
  installJobId?: string;
};

/** Equipment on site (from invoice material lines) plus the warranty evidence trail. */
export function EquipmentPanel({ equipment, dossierEquipment, evidence, installJobId }: EquipmentPanelProps) {
  const fallback = equipmentFallback(equipment, dossierEquipment);
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle>
          Equipment
          <span className="ml-2 text-xs font-normal text-muted-foreground">{equipmentCaption(equipment.length, fallback.length)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <EquipmentList equipment={equipment} fallback={fallback} installJobId={installJobId} />

        {evidence.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              Warranty evidence ({evidence.length})
              <span className="ml-1 group-open:hidden">▸</span>
              <span className="ml-1 hidden group-open:inline">▾</span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-sm">
              {evidence.map((ev, i) => (
                <EvidenceItem key={i} evidence={ev} />
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
