import type { AddressDossier } from "@/domain/dossier-fallback";
import { fmtDate, money, pluralize } from "@/lib/ui/format";

/**
 * Deterministic two-or-three sentence summary for an address when W1-D's
 * LLM brief is not on file yet. Pure; kept out of the agent tool module so
 * the page does not pull the tool registry (circular import) into a server
 * component.
 */
export function fallbackAddressSummary(d: AddressDossier, now: Date = new Date()): string {
  const parts: string[] = [];
  const lv = d.last_visit;
  if (lv) {
    const who = lv.tech_names.length ? lv.tech_names.join(" and ") : "we";
    const work = lv.work_items.length ? lv.work_items.slice(0, 3).join(", ").toLowerCase() : null;
    parts.push(
      `Last visit ${fmtDate(lv.date)} (${who}${lv.invoice_number ? `, #${lv.invoice_number}` : ""}): ${work ? `${work}.` : lv.summary && lv.summary !== "Service visit" ? `${lv.summary.replace(/\.?$/, ".")}` : `${lv.description ?? "service visit"}.`}`,
    );
  } else {
    parts.push("No completed visit at this address on file yet.");
  }
  parts.push(`${pluralize(d.visit_count_12m, "visit")} in the last 12 months.`);

  const flags: string[] = [];
  const soon = d.upcoming[0];
  if (soon) flags.push(`Next visit ${fmtDate(soon.window_start)}${soon.tech_names.length ? ` with ${soon.tech_names.join(", ")}` : ""}.`);
  if (d.equipment.length) {
    const e = d.equipment[0];
    const label = [e.brand, e.tonnage ? `${e.tonnage} ton` : null, e.kind].filter(Boolean).join(" ");
    flags.push(`${d.equipment.length > 1 ? `${d.equipment.length} equipment lines on file, latest a` : "Equipment on file: a"} ${label}${e.installed_at ? ` installed ${fmtDate(e.installed_at)}` : ""}.`);
  }
  if (d.warranty.status === "covered" && d.warranty.labor.until) flags.push(`Labor warranty runs to ${fmtDate(d.warranty.labor.until)}.`);
  else if (d.warranty.status === "partially_covered") flags.push("Warranty is partial; see the basis before quoting.");
  if (d.open_issue_details.length) flags.push(`${pluralize(d.open_issue_details.length, "open issue")}.`);
  if (d.recurring_issues.length) flags.push(`Recurring: ${d.recurring_issues[0].toLowerCase()}.`);
  if (d.open_balance_cents > 0) flags.push(`Open balance ${money(d.open_balance_cents)} across ${pluralize(d.open_balance_jobs, "job")}.`);
  void now;
  return [...parts, ...flags.slice(0, 4)].join(" ");
}

/**
 * Split a summary (LLM brief or fallback sentence) into paragraphs: blank
 * lines or bullet lines start a new one; bullet markers are stripped.
 */
export function summaryParagraphs(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n{2,}|\n(?=[-*•])/)
    .map((p) => p.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export type CustomerSummaryInput = {
  displayName: string;
  kind: string | null;
  company: string | null;
  jobCount: number;
  firstJob: Date | string | null;
  lastJob: Date | string | null;
};

/**
 * Deterministic one-or-two sentence summary for a customer when no LLM
 * brief is on file.
 */
export function fallbackCustomerSummary(c: CustomerSummaryInput, sitesCount: number, balance: { total_cents: number; invoiceCount: number }): string {
  return [
    `${c.displayName} is a ${c.kind === "business" || c.company ? "business" : "homeowner"} customer with ${pluralize(sitesCount, "service address", "service addresses")} and ${pluralize(c.jobCount, "job")} on file`,
    c.firstJob ? `since ${fmtDate(c.firstJob)}` : null,
    c.lastJob ? `, last on ${fmtDate(c.lastJob)}` : null,
    ".",
    balance.total_cents > 0 ? ` Open balance ${money(balance.total_cents)} across ${pluralize(balance.invoiceCount, "invoice")}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".");
}
