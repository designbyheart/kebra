/**
 * Fuzzy identity lookups shared by the agent tools and the office UI.
 *
 * findAddress: pg_trgm over addresses.search_text (see address-normalize.ts)
 * with additive boosts for an exact house number, city, customer and a recent
 * visit. findCustomer: trigram on display_name / company, or exact E.164 on
 * customer_phones.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  extractHouseNumber,
  formatAddressLabel,
  normalizeAddress,
} from "@/lib/address-normalize";

export const CONFIDENT = 0.85;
const RECENT_VISIT_DAYS = 180;

export type AddressCandidate = {
  address_id: string;
  customer_id: string;
  customer_name: string;
  street: string;
  unit: string | null;
  city: string | null;
  zip: string | null;
  label: string;
  confidence: number;
  last_visit_at: string | null;
  /** internal grouping keys, also useful to the UI */
  house_number: number | null;
  street_name: string | null;
};

export type FindAddressResult = {
  candidates: AddressCandidate[];
  /** the top candidate is one of several units in the same building and no unit was given */
  needs_unit: boolean;
  /** units available at the top candidate's building when needs_unit */
  units: string[];
  normalized_query: string;
};

export type FindAddressOptions = {
  unit?: string | null;
  city?: string | null;
  customerId?: string | null;
  limit?: number;
};

type AddressRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  street: string;
  unit: string | null;
  city: string | null;
  zip: string | null;
  house_number: number | null;
  street_name: string | null;
  last_visit_at: Date | string | null;
  score: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Unit designator stripped for comparisons: "Unit #8B" -> "8b". */
export function normalizeUnit(u: string | null | undefined): string {
  return normalizeAddress(u).replace(/\bunit\b/g, "").replace(/\s+/g, " ").trim();
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const lastToken = (s: string) => {
  const parts = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
};

/**
 * The unit the caller meant, as a compact key ("36w", "283", "4b"): either
 * the explicit option or one spoken inside the query ("unit 36W", or a
 * trailing token with digits after the street like "... cay rd 283").
 */
export function extractUnitToken(normalizedQuery: string, explicitUnit?: string | null): string {
  if (explicitUnit) return alnum(normalizeUnit(explicitUnit));
  const q = normalizedQuery;
  const m = /\bunit\s+([a-z0-9]+)(?:\s+([a-z]))?\b/.exec(q);
  if (m) return m[2] && /\d/.test(m[1]) ? `${m[1]}${m[2]}` : m[1];
  const tokens = q.split(" ");
  const last = tokens[tokens.length - 1] ?? "";
  if (tokens.length >= 3 && /\d/.test(last) && !/^\d{5}$/.test(last) && /^[a-z0-9]{1,6}$/.test(last)) return last;
  return "";
}

/** Does a stored unit ("High Pointe Unit 36W") match the caller's token ("36w")? */
export function unitMatches(storedUnit: string | null | undefined, token: string): "exact" | "partial" | "none" {
  if (!token || !storedUnit) return "none";
  const full = alnum(normalizeUnit(storedUnit));
  if (full === token || lastToken(storedUnit) === token) return "exact";
  if (full.includes(token)) return "partial";
  return "none";
}

export async function findAddress(query: string, opts: FindAddressOptions = {}): Promise<FindAddressResult> {
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10);
  const unitNorm = opts.unit ? normalizeUnit(opts.unit) : "";
  const q = normalizeAddress(unitNorm ? `${query} unit ${unitNorm}` : query);
  if (!q) return { candidates: [], needs_unit: false, units: [], normalized_query: q };
  const houseNumber = extractHouseNumber(q);
  const cityNorm = opts.city ? normalizeAddress(opts.city) : "";
  const customerId = opts.customerId ?? null;
  const unitTok = extractUnitToken(q, opts.unit);

  // Similarity blends whole-string trigram similarity (penalizes matching the
  // wrong building on a shared street) with word_similarity (rewards a spoken
  // fragment that is a clean substring of the stored text). Boosts per brief.
  const rows = (await db.execute(sql`
    with scored as (
      select
        a.id, a.customer_id, c.display_name as customer_name,
        a.street, a.unit, a.city, a.zip, a.house_number, a.street_name,
        (0.5 * similarity(a.search_text, ${q}) + 0.5 * word_similarity(${q}, a.search_text))
          + case when ${houseNumber}::int is not null and a.house_number = ${houseNumber}::int then 0.25 else 0 end
          + case when ${cityNorm}::text <> '' and lower(coalesce(a.city, '')) = ${cityNorm}::text then 0.10
                 when ${cityNorm}::text = '' and a.city is not null
                      and position(lower(a.city) in ${q}) > 0 then 0.10
                 else 0 end
          + case when ${customerId}::text is not null and a.customer_id = ${customerId}::text then 0.15 else 0 end
          -- Unit spoken by the caller: exact match is as strong a signal as the
          -- house number; a different unit in the same building is a wrong door.
          + case when ${unitTok}::text = '' or a.unit is null then 0
                 when regexp_replace(lower(a.unit), '[^a-z0-9]', '', 'g') = ${unitTok}::text
                   or regexp_replace(lower(a.unit), '^.*[^a-z0-9]', '') = ${unitTok}::text then 0.20
                 when regexp_replace(lower(a.unit), '[^a-z0-9]', '', 'g') like '%' || ${unitTok}::text || '%' then 0.10
                 else -0.10 end
          as base
      from addresses a
      join customers c on c.id = a.customer_id
      where similarity(a.search_text, ${q}) > 0.12
         or word_similarity(${q}, a.search_text) > 0.5
         or (${houseNumber}::int is not null and a.house_number = ${houseNumber}::int)
      order by base desc
      limit 25
    ),
    visited as (
      select s.*,
        (select max(coalesce(j.completed_at, j.started_at, j.scheduled_start))
           from jobs j
          where j.address_id = s.id
            and j.work_status in ('complete rated', 'complete unrated', 'in progress')) as last_visit_at
      from scored s
    )
    select *,
      base + case when last_visit_at >= now() - make_interval(days => ${RECENT_VISIT_DAYS}) then 0.05 else 0 end as score
    from visited
    order by score desc, last_visit_at desc nulls last, id
    limit ${limit}
  `)) as unknown as AddressRow[];

  const candidates: AddressCandidate[] = rows.map((r) => ({
    address_id: r.id,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    street: r.street,
    unit: r.unit,
    city: r.city,
    zip: r.zip,
    label: formatAddressLabel({ street: r.street, unit: r.unit, city: r.city }),
    confidence: round(clamp01(Number(r.score))),
    last_visit_at: r.last_visit_at ? new Date(r.last_visit_at).toISOString() : null,
    house_number: r.house_number,
    street_name: r.street_name,
  }));

  // Multi-unit detection: enumerate every unit at the top candidate's
  // building (a building can have more units than we return) and ask for
  // one unless the caller's unit already picked a door.
  let needsUnit = false;
  let units: string[] = [];
  const top = candidates[0];
  if (top && unitMatches(top.unit, unitTok) === "none") {
    units = await unitsAtBuilding(top);
    if (units.length > 1) needsUnit = true;
    else units = [];
  }

  return { candidates, needs_unit: needsUnit, units, normalized_query: q };
}

/** Distinct units sharing the candidate's house number + street (or street + city when unnumbered). */
async function unitsAtBuilding(c: AddressCandidate): Promise<string[]> {
  const rows = (await db.execute(
    c.house_number !== null
      ? sql`select unit from addresses where house_number = ${c.house_number} and street_name = ${c.street_name ?? ""}`
      : sql`select unit from addresses where normalized_street = ${normalizeAddress(c.street)} and coalesce(city, '') = ${c.city ?? ""}`,
  )) as unknown as { unit: string | null }[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const label = r.unit?.trim() || "(no unit)";
    const key = normalizeUnit(label) || label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export type CustomerCandidate = {
  customer_id: string;
  display_name: string;
  kind: string | null;
  company: string | null;
  sites_count: number;
  last_job_at: string | null;
  label: string;
  confidence: number;
  matched_by: "phone" | "name";
};

export type FindCustomerInput = { name?: string | null; company?: string | null; phone?: string | null; limit?: number };

type CustomerRow = {
  id: string;
  display_name: string;
  kind: string | null;
  company: string | null;
  sites_count: number | string;
  last_job: Date | string | null;
  score: number | string;
  matched_by: "phone" | "name";
};

export async function findCustomer(input: FindCustomerInput): Promise<CustomerCandidate[]> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const phone = input.phone?.trim() || null;
  const nameQ = [input.name, input.company]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!phone && !nameQ) return [];

  const rows = (await db.execute(sql`
    with by_phone as (
      select c.id, 1.0::float as score, 'phone'::text as matched_by
      from customers c
      where ${phone}::text is not null and (
        c.phone = ${phone}::text
        or exists (select 1 from customer_phones p where p.customer_id = c.id and p.phone = ${phone}::text)
      )
    ),
    by_name as (
      select c.id,
        greatest(
          similarity(lower(c.display_name), ${nameQ}),
          similarity(lower(coalesce(c.company, '')), ${nameQ}),
          similarity(lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ${nameQ}),
          0.9 * word_similarity(${nameQ}, lower(c.display_name))
        )::float as score,
        'name'::text as matched_by
      from customers c
      where ${nameQ}::text <> ''
        and (lower(c.display_name) % ${nameQ} or lower(coalesce(c.company, '')) % ${nameQ}
             or word_similarity(${nameQ}, lower(c.display_name)) > 0.6)
    ),
    merged as (
      select id, max(score) as score, min(matched_by) as matched_by
      from (select * from by_phone union all select * from by_name) u
      group by id
    )
    select c.id, c.display_name, c.kind, c.company, c.last_job,
      (select count(*) from addresses a where a.customer_id = c.id) as sites_count,
      m.score, m.matched_by
    from merged m join customers c on c.id = m.id
    order by m.score desc, c.last_job desc nulls last, c.id
    limit ${limit}
  `)) as unknown as CustomerRow[];

  return rows.map((r) => ({
    customer_id: r.id,
    display_name: r.display_name,
    kind: r.kind,
    company: r.company,
    sites_count: Number(r.sites_count),
    last_job_at: r.last_job ? new Date(r.last_job).toISOString() : null,
    label: r.company && r.company !== r.display_name ? `${r.display_name} (${r.company})` : r.display_name,
    confidence: round(clamp01(Number(r.score))),
    matched_by: r.matched_by,
  }));
}
