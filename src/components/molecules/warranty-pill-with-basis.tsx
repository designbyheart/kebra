"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/ui/tooltip";
import { WarrantyPill } from "@/components/atoms/warranty-pill";
import { WARRANTY_LABEL } from "@/lib/ui/job-status";
import { partsCoveredLabel, partsRegisteredLabel, type WarrantyView } from "@/lib/ui/customer-view";
import { fmtDate } from "@/lib/ui/format";

const LABOR_LABEL = { covered: "covered", uncovered: "not covered" } as const;

export type WarrantyPillWithBasisProps = { warranty: WarrantyView };

/** Warranty status pill; hovering shows the basis for labor and parts and the caveat. */
export function WarrantyPillWithBasis({ warranty }: WarrantyPillWithBasisProps) {
  const w = warranty;
  const labor = (w.labor.covered && "covered") || "uncovered";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className="inline-flex cursor-help items-center gap-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" />
        }
      >
        <WarrantyPill status={w.status}>
          {WARRANTY_LABEL[w.status]}
          {w.labor.covered && w.labor.until && <span className="font-normal opacity-80">· labor to {fmtDate(w.labor.until)}</span>}
          <Info className="size-3 opacity-60" />
        </WarrantyPill>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-sm space-y-2 p-3 text-left">
        <div>
          <div className="text-xs font-semibold tracking-wide uppercase opacity-70">Labor · {LABOR_LABEL[labor]}</div>
          <p className="text-sm leading-relaxed">{w.labor.basis}</p>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wide uppercase opacity-70">
            Parts · {partsCoveredLabel(w.parts.covered)}
            {partsRegisteredLabel(w.parts.registered)}
          </div>
          <p className="text-sm leading-relaxed">{w.parts.basis}</p>
        </div>
        <p className="text-xs leading-relaxed opacity-80">{w.caveat}</p>
        {w.needs_office_confirmation && <p className="text-sm font-medium">Office should confirm before quoting.</p>}
      </TooltipContent>
    </Tooltip>
  );
}
