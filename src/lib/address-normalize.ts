/**
 * Address normalization shared by the importer (addresses.search_text,
 * house_number, street_name) and find_address (the spoken query). Both sides
 * MUST go through the same function so trigram similarity compares like with
 * like. Pure, no I/O.
 *
 * Canonical form: lowercase, punctuation stripped, number words -> digits,
 * ordinal suffixes dropped ("42nd" -> "42"), directionals and street suffixes
 * contracted to their USPS-style abbreviation, unit designators unified to
 * "unit".
 */

const DIRECTIONALS: Record<string, string> = {
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
};

const SUFFIXES: Record<string, string> = {
  road: "rd",
  lane: "ln",
  court: "ct",
  drive: "dr",
  boulevard: "blvd",
  trail: "trl",
  cove: "cv",
  square: "sq",
  street: "st",
  avenue: "ave",
  av: "ave",
  circle: "cir",
  highway: "hwy",
  parkway: "pkwy",
  place: "pl",
  terrace: "ter",
  wy: "way",
  alley: "aly",
  building: "bldg",
};

const UNIT_WORDS = new Set(["unit", "unti", "apt", "apartment", "suite", "ste", "no", "number"]);

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const OH = new Set(["oh", "o"]);

function isNumberWord(w: string | undefined): boolean {
  return w !== undefined && (w in UNITS || w in TENS || w === "hundred" || w === "thousand");
}

/**
 * Convert runs of spoken number words into digit strings the way people say
 * house numbers: "thirty two eighty four" -> "3284", "ten two five four" ->
 * "10254", "three thousand two hundred eighty four" -> "3284", "one oh two"
 * -> "102". Each spoken group becomes its own digit run and consecutive
 * groups are concatenated. Non-number tokens pass through unchanged.
 */
export function wordsToNumbers(text: string): string {
  const raw = text.split(/\s+/).filter(Boolean);
  // "oh"/"o" counts as zero only when it sits inside a run of number words
  // ("one oh two" -> 102, but "unit o" stays as is). Two passes so chains of
  // "oh oh" resolve from either side.
  const tokens = raw.slice();
  for (const pass of [0, 1]) {
    const idx = pass === 0 ? tokens.map((_, k) => k) : tokens.map((_, k) => tokens.length - 1 - k);
    for (const k of idx) {
      if (OH.has(tokens[k]) && (isNumberWord(tokens[k - 1]) || isNumberWord(tokens[k + 1]))) tokens[k] = "zero";
    }
  }
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isNumberWord(tokens[i])) {
      out.push(tokens[i]);
      i += 1;
      continue;
    }
    // Consume a run of spoken groups and concatenate their digits.
    let digits = "";
    while (i < tokens.length && isNumberWord(tokens[i])) {
      const g = readGroup(tokens, i);
      if (!g) {
        // A bare "hundred"/"thousand" with nothing before it: pass through.
        if (digits) out.push(digits);
        digits = "";
        out.push(tokens[i]);
        i += 1;
        continue;
      }
      digits += String(g.value);
      i = g.next;
      // Skip "and" only inside a run ("three hundred and four").
      if (tokens[i] === "and" && isNumberWord(tokens[i + 1])) i += 1;
    }
    if (digits) out.push(digits);
  }
  return out.join(" ");
}

/** Read one spoken group starting at i; returns its value and the next index. */
function readGroup(tokens: string[], i: number): { value: number; next: number } | null {
  let value = 0;
  let j = i;
  const lead = readSmall(tokens, j);
  if (!lead) return null;
  value = lead.value;
  j = lead.next;
  if (tokens[j] === "thousand") {
    value *= 1000;
    j += 1;
    const h = readSmall(tokens, j);
    if (h) {
      let hv = h.value;
      j = h.next;
      if (tokens[j] === "hundred") {
        hv *= 100;
        j += 1;
        const tail = readSmall(tokens, j);
        if (tail) {
          hv += tail.value;
          j = tail.next;
        }
      }
      value += hv;
    }
    return { value, next: j };
  }
  if (tokens[j] === "hundred") {
    value *= 100;
    j += 1;
    if (tokens[j] === "and" && isNumberWord(tokens[j + 1])) j += 1;
    const tail = readSmall(tokens, j);
    if (tail) {
      value += tail.value;
      j = tail.next;
    }
  }
  return { value, next: j };
}

/** "thirty two" | "eighty" | "nineteen" | "four" -> value < 100 */
function readSmall(tokens: string[], i: number): { value: number; next: number } | null {
  const t = tokens[i];
  if (t === undefined) return null;
  if (t in TENS) {
    const n = tokens[i + 1];
    if (n !== undefined && n in UNITS && UNITS[n] > 0 && UNITS[n] < 10) {
      return { value: TENS[t] + UNITS[n], next: i + 2 };
    }
    return { value: TENS[t], next: i + 1 };
  }
  if (t in UNITS) return { value: UNITS[t], next: i + 1 };
  return null;
}

/** Canonical lowercase form used for search_text and for spoken queries. */
export function normalizeAddress(text: string | null | undefined): string {
  if (!text) return "";
  let s = text.toLowerCase();
  s = s.replace(/#/g, " unit ");
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1"); // ordinals
  s = wordsToNumbers(s);
  const tokens = s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (UNIT_WORDS.has(w)) return "unit";
      if (w in DIRECTIONALS) return DIRECTIONALS[w];
      if (w in SUFFIXES) return SUFFIXES[w];
      return w;
    });
  // Collapse repeated unit designators ("unit # 8b" -> "unit 8b").
  const collapsed: string[] = [];
  for (const w of tokens) {
    if (w === "unit" && collapsed[collapsed.length - 1] === "unit") continue;
    collapsed.push(w);
  }
  return collapsed.join(" ");
}

export type ParsedStreet = { houseNumber: number | null; streetName: string };

/**
 * Split a street line into its leading house number and the rest, both
 * normalized. "10254 East Old Mangrove Rd" -> { 10254, "e old mangrove rd" }.
 * Streets without a leading number keep the whole line as street_name.
 */
export function parseStreet(street: string | null | undefined): ParsedStreet {
  const norm = normalizeAddress(street);
  const m = /^(\d{1,6})\s+(.+)$/.exec(norm);
  if (!m) return { houseNumber: null, streetName: norm };
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n > 2_147_483_647) return { houseNumber: null, streetName: norm };
  return { houseNumber: n, streetName: m[2] };
}

/** Leading house number of a spoken query, if any (after normalization). */
export function extractHouseNumber(query: string): number | null {
  return parseStreet(query).houseNumber;
}

/** search_text = normalized "street unit city zip". */
export function buildSearchText(parts: {
  street: string | null | undefined;
  unit?: string | null;
  city?: string | null;
  zip?: string | null;
}): string {
  return normalizeAddress([parts.street, parts.unit, parts.city, parts.zip].filter(Boolean).join(" "));
}

/** Human label: "3284 Harborlight Hollow Ln, Unit 5, Miami Beach". */
export function formatAddressLabel(parts: {
  street: string;
  unit?: string | null;
  city?: string | null;
}): string {
  const bits = [parts.street.trim()];
  if (parts.unit) {
    const u = parts.unit.trim();
    bits.push(/^(unit|apt|suite|ste|bldg|building|cottage|casa)\b/i.test(u) ? u : `Unit ${u}`);
  }
  if (parts.city) bits.push(parts.city.trim());
  return bits.join(", ");
}
