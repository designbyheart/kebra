import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { laborCoverageLabel, partsCoverageLabel, type WarrantyView } from "@/lib/ui/customer-view";

export type WarrantyCardProps = { warranty: WarrantyView };

/** Labor / parts coverage with the basis for each and the caveat. */
export function WarrantyCard({ warranty }: WarrantyCardProps) {
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle>Warranty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-xs font-medium text-muted-foreground">Labor · {laborCoverageLabel(warranty.labor)}</div>
          <p className="leading-relaxed">{warranty.labor.basis}</p>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">Parts · {partsCoverageLabel(warranty.parts)}</div>
          <p className="leading-relaxed">{warranty.parts.basis}</p>
        </div>
        <p className="text-xs text-muted-foreground">{warranty.caveat}</p>
      </CardContent>
    </Card>
  );
}
