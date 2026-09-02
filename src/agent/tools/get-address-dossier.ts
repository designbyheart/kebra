import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { addressDossiers } from "@/db/schema";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { speakStreet } from "@/agent/tools/find-address";
import { buildDossierFallback, type AddressDossier } from "@/domain/dossier-fallback";
import { DAY_MS, dollars, firstName, joinSpoken, spokenDate, spokenDay, spokenTime } from "@/domain/history";

// ---------------------------------------------------------------------------
// Sentence builders (exported for tests)
// ---------------------------------------------------------------------------

/** Price-book family -> past-tense phrase a receptionist would say. */
const WORK_PHRASES: [RegExp, string][] = [
  [/clear(ed)? drain line|drain line clear/i, "cleared the drain line"],
  [/jet mainline drain|jetted/i, "jetted the main drain line"],
  [/capacitor replacement|replace capacitor/i, "replaced the capacitor"],
  [/contactor replacement/i, "replaced the contactor"],
  [/compressor replacement|^compressor$/i, "replaced the compressor"],
  [/blower motor|rescue motor/i, "replaced the blower motor"],
  [/condenser (fan )?motor/i, "replaced the condenser fan motor"],
  [/control board/i, "replaced the control board"],
  [/transformer replacement/i, "replaced the transformer"],
  [/txv repair|txv/i, "replaced the TXV and filter drier"],
  [/evaporator coil/i, "replaced the evaporator coil"],
  [/coil clean/i, "cleaned the coil in place"],
  [/leak detection/i, "ran a leak detection"],
  [/replace fuse/i, "replaced a fuse"],
  [/rewire thermostat/i, "rewired the thermostat"],
  [/reconfigure thermostat/i, "reconfigured the thermostat"],
  [/thermostat installation|install(ed)? .*thermostat|ecobee/i, "installed a thermostat"],
  [/reconfigure pvc/i, "reconfigured the drain PVC"],
  [/vacuum drain pan/i, "vacuumed the drain pan"],
  [/condensate pump/i, "installed a condensate pump"],
  [/safety switch|wet switch|float switch/i, "replaced the safety switch"],
  [/system installation|new system|heat pump system/i, "installed the new system"],
  [/preventative maintenance|^pm\b|visit #\d+|maintenance/i, "did the maintenance visit"],
  [/water heater/i, "put in a water heater"],
];

const GENERIC: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(.+?) replacement$/i, (m) => `replaced the ${m[1].toLowerCase()}`],
  [/^replace (.+)$/i, (m) => `replaced the ${m[1].toLowerCase()}`],
  [/^(.+?) installation(?: labor)?$/i, (m) => `installed the ${m[1].toLowerCase()}`],
  [/^install(?:ing|ed)? (?:new )?(.+)$/i, (m) => `installed a ${m[1].toLowerCase()}`],
  [/^clear (.+)$/i, (m) => `cleared the ${m[1].toLowerCase()}`],
  [/^clean (.+)$/i, (m) => `cleaned the ${m[1].toLowerCase()}`],
  [/^repair (.+)$/i, (m) => `repaired the ${m[1].toLowerCase()}`],
];

export function spokenWork(family: string): string | null {
  const f = family.trim();
  if (!f) return null;
  for (const [re, phrase] of WORK_PHRASES) if (re.test(f)) return phrase;
  for (const [re, fn] of GENERIC) {
    const m = re.exec(f);
    if (m) return fn(m);
  }
  return null;
}

/** "cleared the drain line and replaced the safety switch" from the visit's billed work, else the description. */
export function describeWork(lv: { work_items: string[]; description: string | null; summary: string }): string | null {
  const phrases = [...new Set(lv.work_items.map(spokenWork).filter((p): p is string => Boolean(p)))].slice(0, 3);
  if (phrases.length) return joinSpoken(phrases);
  const fromDesc = lv.description ? spokenWork(lv.description.split(/\s+-\s+/).pop() ?? lv.description) : null;
  if (fromDesc) return fromDesc;
  return null;
}

export function spokenAddress(label: string, street: string, unit: string | null): string {
  const bits = [speakStreet(street)];
  if (unit) bits.push(/^(unit|apt|apartment|suite|ste|bldg|building|cottage|casa)\b/i.test(unit) ? unit : `unit ${unit}`);
  return bits.join(", ") || label;
}

function lower1(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/**
 * Two sentences: last visit + what was done, then the single most useful flag
 * (upcoming visit within two weeks, recent callback, open balance, warranty).
 * Never includes access codes.
 */
export function dossierSpeechHint(d: AddressDossier, now: Date = new Date()): string {
  const where = spokenAddress(d.address_label, d.street, d.unit);
  const lv = d.last_visit;

  let first: string;
  if (!lv) {
    first = `We don't have a completed visit at ${where} on file yet.`;
  } else {
    const names = lv.tech_names.map(firstName).filter(Boolean);
    const who = names.length ? joinSpoken(names.slice(0, 3)) : "we";
    const work = describeWork(lv);
    const when = spokenDate(lv.date, { now });
    if (work) first = `We were last at ${where} on ${when}; ${who} ${work}.`;
    else if (lv.summary && lv.summary !== "Service visit") first = `We were last at ${where} on ${when}; ${who} noted "${lower1(lv.summary)}".`;
    else first = `We were last at ${where} on ${when}; ${who === "we" ? "there are" : `${who} was out but there are`} no notes on that visit.`;
  }

  let flag: string | null = null;
  const soon = d.upcoming.find((u) => new Date(u.window_start).getTime() - now.getTime() <= 14 * DAY_MS);
  const cb = d.open_issue_details.find((o) => o.kind === "callback" && o.date && now.getTime() - new Date(o.date).getTime() <= 365 * DAY_MS);
  const other = d.open_issue_details.find((o) => o.kind !== "callback");
  if (soon) {
    const what = soon.description && /system installation|new system/i.test(soon.description) ? "the new system install" : soon.description?.trim() ? lower1(soon.description.split(/\s+-\s+/).pop()!) : "the next visit";
    const tech = soon.tech_names.length ? ` with ${joinSpoken(soon.tech_names.map(firstName).slice(0, 2))}` : "";
    flag = `${what[0].toUpperCase()}${what.slice(1)} is on the books ${spokenDay(soon.window_start, now)} from ${spokenTime(soon.window_start)}${soon.window_end ? ` to ${spokenTime(soon.window_end)}` : ""}${tech}.`;
  } else if (cb) {
    const label = lower1(cb.text.split(" on ")[0].split(" (")[0]);
    flag = lv && cb.job_id === lv.job_id ? `That visit is tagged as a ${label}.` : `There's a ${label} tag from the ${spokenDate(cb.date!, { now })} visit.`;
  } else if (other) {
    flag = other.kind === "needs_scheduling" ? "There's a job here still waiting to be scheduled." : "There's a cancellation pending office approval.";
  } else if (d.open_balance_cents > 0) {
    flag =
      lv && d.open_balance_jobs === 1 && lv.outstanding_cents === d.open_balance_cents
        ? `There's an open balance of ${dollars(d.open_balance_cents)} from that visit.`
        : `There's an open balance of ${dollars(d.open_balance_cents)} across ${d.open_balance_jobs} jobs here.`;
  } else if (d.warranty.status === "covered" && d.warranty.labor.until) {
    flag = `Labor is under our warranty until ${spokenDate(d.warranty.labor.until, { now })}.`;
  } else if (d.recurring_issues.length) {
    flag = `Heads up: ${lower1(d.recurring_issues[0])}.`;
  }

  return flag ? `${first} ${flag}` : first;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const getAddressDossierTool = defineTool({
  description:
    "The one-call answer to 'when were you last here and what did you do' for a confirmed service address. " +
    "Returns the last visit (date, tech, what was done), equipment on site, warranty status with evidence, open issues, " +
    "recurring problems, open balance, upcoming visits and a spoken two-sentence summary. Call this right after " +
    "find_address confirms the address. access_notes are for the office only; never read them aloud.",
  input: z.object({
    address_id: z.string().trim().min(1).max(64).describe("address_id from find_address"),
  }),
  handler: async (input) => {
    const now = new Date();
    const [fallback, rows] = await Promise.all([
      buildDossierFallback(input.address_id, now),
      db.select().from(addressDossiers).where(eq(addressDossiers.addressId, input.address_id)).limit(1),
    ]);
    if (!fallback) {
      throw new ToolError("not_found", `address ${input.address_id} not found`, "I couldn't find that address on file. Could you confirm the street address?");
    }
    const row = rows[0];
    const summary_md = row?.summaryMd?.trim() || null;
    return {
      ...fallback,
      summary_md,
      generated_at: row?.generatedAt ? row.generatedAt.toISOString() : null,
      source: summary_md ? ("precomputed+fallback" as const) : ("fallback" as const),
      speech_hint: dossierSpeechHint(fallback, now),
    };
  },
});
