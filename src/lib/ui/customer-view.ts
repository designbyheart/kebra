/**
 * Pure view helpers for the customer and address dossiers (labels, class
 * maps and small derived values). React-free; unit tested.
 */
import type { Equipment } from "@/domain/warranty";
import type { WarrantyStatus } from "@/lib/ui/job-status";
import type { WorkStatus } from "@/lib/job-constants";
import { fmtDate } from "@/lib/ui/format";

// ---------------------------------------------------------------------------
// Types shared by the dossier components
// ---------------------------------------------------------------------------

export type WarrantyView = {
  status: WarrantyStatus;
  labor: { covered: boolean; until?: string; basis: string };
  parts: { covered: boolean | "likely"; until?: string; registered: boolean | "unknown"; basis: string };
  caveat: string;
  needs_office_confirmation: boolean;
};

export type UpcomingItem = {
  job_id: string;
  invoice_number: string | null;
  description: string | null;
  work_status: WorkStatus;
  priority?: "normal" | "high" | "emergency";
  source?: "import" | "agent" | "office";
  window_start: string | null;
  window_end: string | null;
  tech_names: string[];
  address_id?: string | null;
  address_label?: string | null;
};

// ---------------------------------------------------------------------------
// Balance cells
// ---------------------------------------------------------------------------

export type BalanceState = "due" | "clear";

/** "due" when the customer / site owes money, "clear" otherwise. */
export function balanceState(cents: number): BalanceState {
  if (cents > 0) return "due";
  return "clear";
}

/** Table-cell tint for an open-balance column. */
export const BALANCE_CELL_CLASS: Record<BalanceState, string> = {
  due: "font-medium text-red-700 dark:text-red-300",
  clear: "text-muted-foreground",
};

/** Header figure tint for the customer's open balance. */
export const BALANCE_FIGURE_CLASS: Record<BalanceState, string> = {
  due: "text-red-700 dark:text-red-300",
  clear: "",
};

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

/** 0.87 → "87%". */
export function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/** Match column: "phone" for phone hits, else the confidence percentage. */
export function matchLabel(matchedBy: "phone" | "name" | undefined, confidence: number | undefined): string {
  if (matchedBy === "phone") return "phone";
  return confidencePct(confidence ?? 0);
}

// ---------------------------------------------------------------------------
// Upcoming jobs / visits
// ---------------------------------------------------------------------------

/** " · Ana, Luis" or " · unassigned" after the visit description. */
export function techSuffix(names: string[]): string {
  if (names.length) return ` · ${names.join(", ")}`;
  return " · unassigned";
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/** "Carrier 3 ton air handler" (capitalised) or the raw invoice line. */
export function equipmentTitle(e: Equipment): string {
  const bits = [e.brand, e.tonnage ? `${e.tonnage} ton` : null, e.kind].filter(Boolean).join(" ");
  return bits ? bits[0].toUpperCase() + bits.slice(1) : e.line;
}

/** W1-D's free-text strings, used only when no structured lines exist. */
export function equipmentFallback(equipment: Equipment[], dossierEquipment: string[] | undefined): string[] {
  if (equipment.length > 0) return [];
  if (dossierEquipment && dossierEquipment.length > 0) return dossierEquipment;
  return [];
}

/** Caption next to the Equipment title: "3 on file" / "from the brief" / "none on file". */
export function equipmentCaption(structuredCount: number, fallbackCount: number): string {
  if (structuredCount > 0) return `${structuredCount} on file`;
  if (fallbackCount > 0) return "from the brief";
  return "none on file";
}

/** "Installed Sep 2, 2026" or "Install date unknown". */
export function installedLabel(installedAt: string | undefined): string {
  if (installedAt) return `Installed ${fmtDate(installedAt)}`;
  return "Install date unknown";
}

// ---------------------------------------------------------------------------
// Warranty
// ---------------------------------------------------------------------------

/** Warranty card labor line: "covered to Sep 2, 2027" / "not covered". */
export function laborCoverageLabel(labor: WarrantyView["labor"]): string {
  if (labor.covered) return `covered to ${fmtDate(labor.until)}`;
  return "not covered";
}

/** Warranty card parts line: "covered to …" / "likely to …" / "not covered". */
export function partsCoverageLabel(parts: WarrantyView["parts"]): string {
  if (parts.covered === true) return `covered to ${fmtDate(parts.until)}`;
  if (parts.covered === "likely") return `likely to ${parts.until ? fmtDate(parts.until) : "—"}`;
  return "not covered";
}

/** Tooltip heading: "covered" / "likely covered" / "not covered". */
export function partsCoveredLabel(covered: boolean | "likely"): string {
  if (covered === true) return "covered";
  if (covered === "likely") return "likely covered";
  return "not covered";
}

/** Tooltip heading suffix: " · registered" / " · not registered" / "". */
export function partsRegisteredLabel(registered: boolean | "unknown"): string {
  if (registered === true) return " · registered";
  if (registered === false) return " · not registered";
  return "";
}

// ---------------------------------------------------------------------------
// Booking dialog
// ---------------------------------------------------------------------------

export const SLOT_REASON_LABEL = {
  last_tech_here: "was here last",
  least_loaded: "lightest day",
  only_available: "only tech free",
} as const;

/** Footer button: "Book with Ana" once a slot is picked, else "Pick an opening". */
export function bookButtonLabel(employeeName: string | null | undefined): string {
  if (employeeName) return `Book with ${employeeName.split(" ")[0]}`;
  return "Pick an opening";
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/** Render a dossier preference value: arrays joined, objects as JSON, else String(). */
export function preferenceValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
