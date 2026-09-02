import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { CONFIDENT, findAddress, type AddressCandidate } from "@/domain/search";

/** Candidate shape per docs/TOOLS.md (internal grouping keys dropped). */
export type FindAddressCandidate = Omit<AddressCandidate, "house_number" | "street_name">;

const SPOKEN: Record<string, string> = {
  n: "North",
  s: "South",
  e: "East",
  w: "West",
  ne: "Northeast",
  nw: "Northwest",
  se: "Southeast",
  sw: "Southwest",
  rd: "Road",
  ln: "Lane",
  ct: "Court",
  dr: "Drive",
  blvd: "Boulevard",
  trl: "Trail",
  cv: "Cove",
  sq: "Square",
  st: "Street",
  ave: "Avenue",
  cir: "Circle",
  hwy: "Highway",
  pkwy: "Parkway",
  pl: "Place",
  ter: "Terrace",
  wy: "Way",
  aly: "Alley",
  bldg: "Building",
  apt: "Apartment",
  ste: "Suite",
};

/** "10254 E Old Mangrove Rd" -> "10254 East Old Mangrove Road" for TTS. */
export function speakStreet(street: string): string {
  return street
    .split(/\s+/)
    .map((w) => {
      const key = w.replace(/[.,]/g, "").toLowerCase();
      return key in SPOKEN ? SPOKEN[key] : w;
    })
    .join(" ");
}

function spokenLabel(c: FindAddressCandidate): string {
  const bits = [speakStreet(c.street)];
  if (c.unit) bits.push(/^(unit|apt|apartment|suite|ste|bldg|building|cottage|casa)\b/i.test(c.unit) ? c.unit : `unit ${c.unit}`);
  if (c.city) bits.push(`in ${c.city}`);
  return bits.join(", ");
}

function joinSpoken(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const findAddressTool = defineTool({
  description:
    "Fuzzy-match a spoken service address to a known customer site. Pass the street as the caller said it " +
    "(spoken numbers like 'thirty two eighty four' are fine); add unit, city or customer_id when known to " +
    "sharpen the match. Returns up to 5 candidates with confidence 0..1. Read the top candidate back for " +
    "confirmation when confidence is 0.85 or higher; if speech_hint asks for a unit, ask before proceeding.",
  input: z.object({
    query: z.string().trim().min(1).max(300).describe("Street address as spoken, e.g. '3284 Harborlight Hollow Lane'"),
    unit: z.string().trim().max(40).optional().describe("Apartment / unit / suite if the caller gave one"),
    city: z.string().trim().max(80).optional(),
    customer_id: z.string().trim().max(64).optional().describe("Restrict/boost to this customer's sites"),
  }),
  handler: async (input) => {
    const r = await findAddress(input.query, {
      unit: input.unit,
      city: input.city,
      customerId: input.customer_id,
    });
    if (r.candidates.length === 0) {
      throw new ToolError(
        "not_found",
        `no address matched "${input.query}"`,
        "I couldn't find that address. Could you spell the street name for me?",
        { candidates: [], normalized_query: r.normalized_query },
      );
    }

    const candidates: FindAddressCandidate[] = r.candidates.map((c) => ({
      address_id: c.address_id,
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      street: c.street,
      unit: c.unit,
      city: c.city,
      zip: c.zip,
      label: c.label,
      confidence: c.confidence,
      last_visit_at: c.last_visit_at,
    }));
    const top = candidates[0];
    const second = candidates[1];

    let speech_hint: string;
    if (r.needs_unit) {
      const where = `${speakStreet(top.street)}${top.city ? ` in ${top.city}` : ""}`;
      speech_hint =
        r.units.length <= 6
          ? `I have ${where}, but there are several units there: ${joinSpoken(r.units)}. Which unit is it?`
          : `I have ${where}, but there are ${r.units.length} units there. Which unit is it?`;
    } else if (top.confidence >= CONFIDENT) {
      const clearWinner = !second || second.label === top.label || second.confidence <= top.confidence - 0.1;
      speech_hint = clearWinner
        ? `I have ${spokenLabel(top)}. Is that right?`
        : `I have two close matches: ${spokenLabel(top)}, or ${spokenLabel(second)}. Which one is it?`;
    } else {
      speech_hint = `The closest I have is ${spokenLabel(top)}. Does that sound right?`;
    }

    return { candidates, needs_unit: r.needs_unit, units: r.units, speech_hint };
  },
});
