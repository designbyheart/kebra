"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WARRANTY_LABEL, WarrantyPill, type WarrantyStatus } from "@/components/jobs/status-badge";
import { fmtDate } from "@/components/jobs/format";

export type WarrantyView = {
  status: WarrantyStatus;
  labor: { covered: boolean; until?: string; basis: string };
  parts: { covered: boolean | "likely"; until?: string; registered: boolean | "unknown"; basis: string };
  caveat: string;
  needs_office_confirmation: boolean;
};

/** Warranty status pill; hovering shows the basis for labor and parts and the caveat. */
export function WarrantyPillWithBasis({ warranty }: { warranty: WarrantyView }) {
  const w = warranty;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" className="inline-flex cursor-help items-center gap-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" />
        }
      >
        <WarrantyPill status={w.status}>
          {WARRANTY_LABEL[w.status]}
          {w.labor.covered && w.labor.until ? <span className="font-normal opacity-80">· labor to {fmtDate(w.labor.until)}</span> : null}
          <Info className="size-3 opacity-60" />
        </WarrantyPill>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-sm space-y-2 p-3 text-left">
        <div>
          <div className="text-[11px] font-semibold tracking-wide uppercase opacity-70">Labor · {w.labor.covered ? "covered" : "not covered"}</div>
          <p className="text-xs leading-relaxed">{w.labor.basis}</p>
        </div>
        <div>
          <div className="text-[11px] font-semibold tracking-wide uppercase opacity-70">
            Parts · {w.parts.covered === true ? "covered" : w.parts.covered === "likely" ? "likely covered" : "not covered"}
            {w.parts.registered === true ? " · registered" : w.parts.registered === false ? " · not registered" : ""}
          </div>
          <p className="text-xs leading-relaxed">{w.parts.basis}</p>
        </div>
        <p className="text-xs leading-relaxed opacity-80">{w.caveat}</p>
        {w.needs_office_confirmation ? <p className="text-xs font-medium">Office should confirm before quoting.</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
