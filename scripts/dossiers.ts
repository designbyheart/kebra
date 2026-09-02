/**
 * pnpm dossiers — precompute address and customer dossiers with Claude via the
 * Message Batches API (W1-D).
 *
 *   pnpm dossiers                         resume in-flight batches, then submit everything pending
 *   pnpm dossiers -- --limit 20           spot-check run (20 addresses + 20 customers)
 *   pnpm dossiers -- --kind address       only one kind (address | customer | all)
 *   pnpm dossiers -- --status <batch_id>  print a batch's processing status
 *   pnpm dossiers -- --check auto|<ids>   print dossiers next to their source notes (faithfulness check)
 *   pnpm dossiers -- --dry-run            build requests, print token estimates, call nothing
 *   pnpm dossiers -- --no-wait            submit and exit; a later run polls and ingests
 *   pnpm dossiers -- --force              regenerate even when the dossier is fresh
 *   pnpm dossiers -- --copy-to-env VAR    upsert finished rows into the DB whose URL is in $VAR
 *
 * Idempotent and resumable: a row is skipped when its generated_at is newer
 * than the latest job update at that address/customer; batch ids live in
 * dossier_batches so a re-run polls an in-flight batch instead of resubmitting.
 * Writes only address_dossiers, customer_dossiers and dossier_batches.
 */
import "dotenv/config";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { db, sql as pg, type Db } from "../src/db";
import * as schema from "../src/db/schema";
import { addressDossiers, customerDossiers, dossierBatches } from "../src/db/schema";
import {
  addUsage,
  classifyResult,
  costCents,
  formatUsd,
  getAnthropic,
  iterateBatchResults,
  submitBatch,
  usageOf,
  waitForBatch,
  ZERO_USAGE,
  type BatchRequest,
  type MessageBatch,
  type TokenUsage,
} from "../src/lib/anthropic";
import { isoDateET } from "../src/lib/time";
import {
  addressDossierOutput,
  buildAddressRequest,
  buildCustomerRequest,
  customerDossierOutput,
  extractAccessNotes,
  lastVisitAt,
  parseCustomId,
  redact,
  sortJobs,
  wordCount,
  type AddressCorpus,
  type BuiltPrompt,
  type CorpusJob,
  type CustomerCorpus,
  type DossierKind,
} from "../src/domain/dossier-prompt";

const RECEIPT_PATH = path.resolve("receipts/claude-dossiers.md");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

type Args = {
  limit?: number;
  kind: DossierKind | "all";
  status?: string;
  check?: string;
  dryRun: boolean;
  noWait: boolean;
  force: boolean;
  copyToEnv?: string;
  pollMs: number;
  effort?: "low" | "medium" | "high";
};

function parseArgs(argv: string[]): Args {
  const a: Args = { kind: "all", dryRun: false, noWait: false, force: false, pollMs: 90_000 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${k} needs a value`);
      return x;
    };
    switch (k) {
      case "--": // pnpm forwards the separator literally
        break;
      case "--limit":
        a.limit = Number(v());
        break;
      case "--kind": {
        const x = v();
        if (x !== "address" && x !== "customer" && x !== "all") throw new Error(`bad --kind ${x}`);
        a.kind = x;
        break;
      }
      case "--status":
        a.status = v();
        break;
      case "--check":
        a.check = v();
        break;
      case "--dry-run":
        a.dryRun = true;
        break;
      case "--no-wait":
        a.noWait = true;
        break;
      case "--force":
        a.force = true;
        break;
      case "--copy-to-env":
        a.copyToEnv = v();
        break;
      case "--poll-ms":
        a.pollMs = Number(v());
        break;
      case "--effort": {
        const x = v();
        if (x !== "low" && x !== "medium" && x !== "high") throw new Error(`bad --effort ${x}`);
        a.effort = x;
        break;
      }
      default:
        throw new Error(`unknown argument ${k}`);
    }
  }
  return a;
}

const log = (s: string) => console.log(`[dossiers] ${s}`);

// ---------------------------------------------------------------------------
// Corpus loading (whole dataset is small: ~2K jobs, ~7K notes, ~4.4K items)
// ---------------------------------------------------------------------------

type LoadedJob = CorpusJob & {
  addressId: string | null;
  customerId: string;
  updatedAt: Date;
};

type Loaded = {
  jobs: LoadedJob[];
  addresses: Map<string, schema.Address>;
  customers: Map<string, schema.Customer>;
};

function addressLabel(a: schema.Address | undefined): string {
  if (!a) return "(no address on file)";
  const unit = a.unit && !a.street.toLowerCase().includes(a.unit.toLowerCase()) ? ` ${a.unit}` : "";
  const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `${a.street}${unit}${cityLine ? `, ${cityLine}` : ""}`;
}

async function loadCorpus(conn: Db): Promise<Loaded> {
  const rows = await conn.query.jobs.findMany({
    with: {
      assignments: { with: { employee: true } },
      notes: true,
      invoices: { with: { items: true } },
    },
  });
  const addrRows = await conn.query.addresses.findMany();
  const custRows = await conn.query.customers.findMany();
  const addresses = new Map(addrRows.map((a) => [a.id, a]));
  const customers = new Map(custRows.map((c) => [c.id, c]));

  const jobs: LoadedJob[] = rows.map((j) => {
    const invoice = j.invoices[0];
    const items = j.invoices
      .flatMap((inv) => inv.items)
      .sort((a, b) => a.seq - b.seq)
      .map((it) => ({ name: it.name, type: it.type, amountCents: it.amount }));
    const techs = j.assignments
      .map((a) => a.employee)
      .filter((e) => e && e.firstName !== "Team")
      .map((e) => e.firstName);
    return {
      id: j.id,
      invoiceNumber: j.invoiceNumber,
      description: j.description,
      workStatus: j.workStatus,
      scheduledStart: j.scheduledStart,
      completedAt: j.completedAt,
      tags: j.tags,
      totalCents: j.totalAmount,
      outstandingCents: j.outstandingBalance,
      invoiceStatus: invoice?.status ?? null,
      techs: [...new Set(techs)],
      siteLabel: addressLabel(j.addressId ? addresses.get(j.addressId) : undefined),
      notes: j.notes
        .sort((a, b) => a.seq - b.seq)
        .map((n) => ({ seq: n.seq, authorType: n.authorType, content: n.content })),
      items,
      addressId: j.addressId,
      customerId: j.customerId,
      updatedAt: j.updatedAt,
    };
  });
  return { jobs, addresses, customers };
}

function groupBy<T>(xs: T[], key: (x: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!k) continue;
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function addressCorpus(loaded: Loaded, addressId: string, jobs: LoadedJob[]): AddressCorpus {
  const a = loaded.addresses.get(addressId);
  const c = loaded.customers.get(jobs[0].customerId) ?? loaded.customers.get(a?.customerId ?? "");
  return {
    addressId,
    label: addressLabel(a),
    customer: { id: c?.id ?? jobs[0].customerId, displayName: c?.displayName ?? "(unknown)", kind: c?.kind ?? null },
    jobs,
  };
}

function customerCorpus(loaded: Loaded, customerId: string, jobs: LoadedJob[]): CustomerCorpus {
  const c = loaded.customers.get(customerId);
  const bySite = groupBy(jobs, (j) => j.addressId ?? "(none)");
  const sites = [...bySite.entries()].map(([addressId, js]) => ({
    addressId,
    label: addressId === "(none)" ? "(no address on file)" : addressLabel(loaded.addresses.get(addressId)),
    jobCount: js.length,
  }));
  sites.sort((x, y) => y.jobCount - x.jobCount || x.label.localeCompare(y.label));
  return {
    customerId,
    displayName: c?.displayName ?? "(unknown)",
    kind: c?.kind ?? null,
    company: c?.company ?? null,
    sites,
    jobs,
    openBalanceCents: jobs.reduce((s, j) => s + j.outstandingCents, 0),
  };
}

// ---------------------------------------------------------------------------
// Pending targets (freshness = generated_at vs latest job update)
// ---------------------------------------------------------------------------

async function pendingAddressIds(conn: Db, loaded: Loaded, force: boolean): Promise<Map<string, LoadedJob[]>> {
  const grouped = groupBy(loaded.jobs, (j) => j.addressId);
  if (force) return grouped;
  const existing = await conn.select({ id: addressDossiers.addressId, at: addressDossiers.generatedAt }).from(addressDossiers);
  const fresh = new Map(existing.map((r) => [r.id, r.at]));
  for (const [id, jobs] of grouped) {
    const at = fresh.get(id);
    const latest = Math.max(...jobs.map((j) => j.updatedAt.getTime()));
    if (at && at.getTime() > latest) grouped.delete(id);
  }
  return grouped;
}

async function pendingCustomerIds(conn: Db, loaded: Loaded, force: boolean): Promise<Map<string, LoadedJob[]>> {
  const grouped = groupBy(loaded.jobs, (j) => j.customerId);
  if (force) return grouped;
  const existing = await conn
    .select({ id: customerDossiers.customerId, at: customerDossiers.generatedAt })
    .from(customerDossiers);
  const fresh = new Map(existing.map((r) => [r.id, r.at]));
  for (const [id, jobs] of grouped) {
    const at = fresh.get(id);
    const latest = Math.max(...jobs.map((j) => j.updatedAt.getTime()));
    if (at && at.getTime() > latest) grouped.delete(id);
  }
  return grouped;
}

/** Deterministic order so `--limit` picks the same rows on every run. */
function take<T>(m: Map<string, T>, limit?: number): Map<string, T> {
  const keys = [...m.keys()].sort();
  const chosen = limit ? keys.slice(0, limit) : keys;
  return new Map(chosen.map((k) => [k, m.get(k) as T]));
}

// ---------------------------------------------------------------------------
// Submit / wait / ingest
// ---------------------------------------------------------------------------

type Prepared = { kind: DossierKind; requests: BatchRequest[]; built: BuiltPrompt[] };

function prepare(kind: DossierKind, loaded: Loaded, targets: Map<string, LoadedJob[]>, args: Args): Prepared {
  const today = isoDateET(new Date());
  const requests: BatchRequest[] = [];
  const built: BuiltPrompt[] = [];
  for (const [id, jobs] of targets) {
    const r =
      kind === "address"
        ? buildAddressRequest(addressCorpus(loaded, id, jobs), { today, effort: args.effort })
        : buildCustomerRequest(customerCorpus(loaded, id, jobs), { today, effort: args.effort });
    requests.push(r.request);
    built.push(r.built);
  }
  return { kind, requests, built };
}

function describePrepared(p: Prepared): string {
  const est = p.built.map((b) => b.estTokens);
  const sum = est.reduce((a, b) => a + b, 0);
  const max = est.length ? Math.max(...est) : 0;
  const truncated = p.built.filter((b) => b.notesOmitted > 0).length;
  return `${p.kind}: ${p.requests.length} requests, ~${sum.toLocaleString()} input tokens (max ${max.toLocaleString()} per request), ${truncated} truncated`;
}

type IngestStats = {
  succeeded: number;
  refusals: number;
  truncated: number;
  badJson: number;
  schemaFail: number;
  errored: number;
  other: number;
  usage: TokenUsage;
  thinkingTokens: number;
  summaryWords: number[];
  failedIds: string[];
};

async function ingestBatch(conn: Db, loaded: Loaded, batch: MessageBatch, kind: DossierKind): Promise<IngestStats> {
  const client = getAnthropic();
  const stats: IngestStats = {
    succeeded: 0,
    refusals: 0,
    truncated: 0,
    badJson: 0,
    schemaFail: 0,
    errored: 0,
    other: 0,
    usage: ZERO_USAGE,
    thinkingTokens: 0,
    summaryWords: [],
    failedIds: [],
  };
  const byAddress = groupBy(loaded.jobs, (j) => j.addressId);
  const byCustomer = groupBy(loaded.jobs, (j) => j.customerId);
  const now = new Date();

  for await (const result of iterateBatchResults(client, batch.id)) {
    const parsedId = parseCustomId(result.custom_id);
    if (!parsedId || parsedId.kind !== kind) {
      log(`  skipping foreign custom_id ${result.custom_id}`);
      stats.other++;
      continue;
    }
    const outcome = classifyResult(result);
    if ("message" in outcome) {
      stats.usage = addUsage(stats.usage, usageOf(outcome.message));
      stats.thinkingTokens += outcome.message.usage.output_tokens_details?.thinking_tokens ?? 0;
    }
    if (outcome.kind !== "ok") {
      if (outcome.kind === "refusal") stats.refusals++;
      else if (outcome.kind === "truncated") stats.truncated++;
      else if (outcome.kind === "bad_json") stats.badJson++;
      else if (outcome.kind === "errored") stats.errored++;
      else stats.other++;
      stats.failedIds.push(`${result.custom_id} (${outcome.kind}${"error" in outcome ? `: ${outcome.error.slice(0, 160)}` : ""})`);
      continue;
    }

    if (kind === "address") {
      const parsed = addressDossierOutput.safeParse(outcome.json);
      if (!parsed.success) {
        stats.schemaFail++;
        stats.failedIds.push(`${result.custom_id} (schema: ${parsed.error.issues[0]?.message})`);
        continue;
      }
      const jobs = byAddress.get(parsedId.id) ?? [];
      const d = parsed.data;
      const row = {
        addressId: parsedId.id,
        summaryMd: d.summary_md,
        lastVisitAt: lastVisitAt(jobs),
        lastVisitSummary: d.last_visit_summary,
        equipment: d.equipment,
        warranty: {
          notes: d.warranty_notes,
          risk_flags: d.risk_flags,
          access_notes_present: d.access_notes_present,
          source: "claude-batch",
          batch_id: batch.id,
        },
        openIssues: d.open_issues,
        accessNotes: extractAccessNotes(jobs.flatMap((j) => j.notes)),
        recurringIssues: d.recurring_issues,
        generatedAt: now,
        model: outcome.message.model,
      };
      await conn
        .insert(addressDossiers)
        .values(row)
        .onConflictDoUpdate({ target: addressDossiers.addressId, set: row });
      stats.summaryWords.push(wordCount(d.summary_md));
      stats.succeeded++;
    } else {
      const parsed = customerDossierOutput.safeParse(outcome.json);
      if (!parsed.success) {
        stats.schemaFail++;
        stats.failedIds.push(`${result.custom_id} (schema: ${parsed.error.issues[0]?.message})`);
        continue;
      }
      const jobs = byCustomer.get(parsedId.id) ?? [];
      const corpus = customerCorpus(loaded, parsedId.id, jobs);
      const d = parsed.data;
      const row = {
        customerId: parsedId.id,
        summaryMd: d.summary_md,
        sitesCount: corpus.sites.filter((s) => s.addressId !== "(none)").length,
        openBalance: corpus.openBalanceCents,
        preferences: {
          ...d.preferences,
          open_issues: d.open_issues,
          risk_flags: d.risk_flags,
          last_visit_summary: d.last_visit_summary,
          source: "claude-batch",
          batch_id: batch.id,
        },
        generatedAt: now,
        model: outcome.message.model,
      };
      await conn
        .insert(customerDossiers)
        .values(row)
        .onConflictDoUpdate({ target: customerDossiers.customerId, set: row });
      stats.summaryWords.push(wordCount(d.summary_md));
      stats.succeeded++;
    }
  }
  return stats;
}

function failures(s: IngestStats): number {
  return s.refusals + s.truncated + s.badJson + s.schemaFail + s.errored + s.other;
}

async function appendReceipt(kind: DossierKind, batch: MessageBatch, s: IngestStats, cents: number): Promise<void> {
  await mkdir(path.dirname(RECEIPT_PATH), { recursive: true });
  let exists = true;
  await readFile(RECEIPT_PATH).catch(() => {
    exists = false;
  });
  const header =
    "# Claude dossier receipts\n\n" +
    "Model `claude-opus-5` via Message Batches (50% off list: input $5/M, output $25/M). One row per batch, appended by `pnpm dossiers`.\n\n" +
    "| ended (UTC) | batch id | kind | requests | ok | failed | refusals | input tok | output tok (thinking) | cost |\n" +
    "|---|---|---|---|---|---|---|---|---|---|\n";
  const line =
    `| ${new Date().toISOString()} | ${batch.id} | ${kind} | ${batch.request_counts.succeeded + batch.request_counts.errored + batch.request_counts.canceled + batch.request_counts.expired} ` +
    `| ${s.succeeded} | ${failures(s)} | ${s.refusals} | ${s.usage.input_tokens.toLocaleString()} ` +
    `| ${s.usage.output_tokens.toLocaleString()} (${s.thinkingTokens.toLocaleString()}) | ${formatUsd(cents)} |\n`;
  await appendFile(RECEIPT_PATH, (exists ? "" : header) + line);
}

async function finishBatch(conn: Db, loaded: Loaded, batchId: string, kind: DossierKind, pollMs: number): Promise<IngestStats> {
  const client = getAnthropic();
  const batch = await waitForBatch(client, batchId, {
    intervalMs: pollMs,
    onPoll: (b) =>
      log(
        `  ${kind} ${b.id}: ${b.processing_status} — processing ${b.request_counts.processing}, ok ${b.request_counts.succeeded}, errored ${b.request_counts.errored}`,
      ),
  });
  log(`ingesting ${kind} batch ${batch.id}`);
  const stats = await ingestBatch(conn, loaded, batch, kind);
  const cents = costCents(stats.usage, { batch: true });
  await conn
    .update(dossierBatches)
    .set({
      status: "ended",
      succeeded: stats.succeeded,
      errored: failures(stats),
      inputTokens: stats.usage.input_tokens,
      outputTokens: stats.usage.output_tokens,
      costCents: cents,
      endedAt: batch.ended_at ? new Date(batch.ended_at) : new Date(),
    })
    .where(eq(dossierBatches.id, batch.id));
  await appendReceipt(kind, batch, stats, cents);
  const words = stats.summaryWords;
  const maxWords = words.length ? Math.max(...words) : 0;
  const over = words.filter((w) => w > 90).length;
  log(
    `  ${kind} done: ok ${stats.succeeded}, refusals ${stats.refusals}, truncated ${stats.truncated}, bad_json ${stats.badJson}, ` +
      `schema ${stats.schemaFail}, errored ${stats.errored}, other ${stats.other}; ` +
      `input ${stats.usage.input_tokens.toLocaleString()} tok, output ${stats.usage.output_tokens.toLocaleString()} tok ` +
      `(thinking ${stats.thinkingTokens.toLocaleString()}); cost ${formatUsd(cents)}; summary words max ${maxWords}, over 90: ${over}`,
  );
  for (const f of stats.failedIds) log(`    failed: ${f}`);
  return stats;
}

async function resumeInFlight(conn: Db, loaded: Loaded, args: Args): Promise<void> {
  const open = await conn.select().from(dossierBatches).where(eq(dossierBatches.status, "in_progress"));
  const relevant = open.filter((b) => args.kind === "all" || b.kind === args.kind);
  if (!relevant.length) return;
  log(`${relevant.length} in-flight batch(es) found; ${args.noWait ? "leaving them (--no-wait)" : "polling them first"}`);
  if (args.noWait) return;
  for (const b of relevant) await finishBatch(conn, loaded, b.id, b.kind as DossierKind, args.pollMs);
}

async function submitKind(conn: Db, loaded: Loaded, kind: DossierKind, args: Args): Promise<string | null> {
  const pending =
    kind === "address"
      ? await pendingAddressIds(conn, loaded, args.force)
      : await pendingCustomerIds(conn, loaded, args.force);
  const targets = take(pending, args.limit);
  log(`${kind}: ${pending.size} pending, ${targets.size} selected`);
  if (!targets.size) return null;
  const p = prepare(kind, loaded, targets, args);
  log(describePrepared(p));
  if (args.dryRun) {
    const sample = p.built[0];
    console.log(`\n--- sample ${kind} prompt (${sample.estTokens} est tokens) ---\n${sample.user}\n--- end sample ---\n`);
    return null;
  }
  const client = getAnthropic();
  const batch = await submitBatch(client, p.requests);
  await conn.insert(dossierBatches).values({
    id: batch.id,
    kind,
    status: "in_progress",
    requestCount: p.requests.length,
  });
  log(`submitted ${kind} batch ${batch.id} (${p.requests.length} requests)`);
  return batch.id;
}

// ---------------------------------------------------------------------------
// --status
// ---------------------------------------------------------------------------

async function printStatus(conn: Db, batchId: string): Promise<void> {
  const b = await getAnthropic().messages.batches.retrieve(batchId);
  const local = await conn.select().from(dossierBatches).where(eq(dossierBatches.id, batchId));
  console.log(
    JSON.stringify(
      {
        id: b.id,
        processing_status: b.processing_status,
        request_counts: b.request_counts,
        created_at: b.created_at,
        ended_at: b.ended_at,
        expires_at: b.expires_at,
        local: local[0] ?? null,
      },
      null,
      2,
    ),
  );
}

// ---------------------------------------------------------------------------
// --check: dossier next to its source notes (the 15-address faithfulness check)
// ---------------------------------------------------------------------------

async function pickCheckIds(conn: Db, loaded: Loaded): Promise<string[]> {
  const rows = await conn.select({ id: addressDossiers.addressId }).from(addressDossiers);
  const have = new Set(rows.map((r) => r.id));
  const byAddress = groupBy(loaded.jobs, (j) => j.addressId);
  const sitesPerCustomer = new Map<string, number>();
  for (const [id, jobs] of byAddress) {
    const c = jobs[0].customerId;
    sitesPerCustomer.set(c, (sitesPerCustomer.get(c) ?? 0) + 1);
    void id;
  }
  const multi: string[] = [];
  const single: string[] = [];
  for (const id of [...have].sort()) {
    const jobs = byAddress.get(id);
    if (!jobs) continue;
    const c = loaded.customers.get(jobs[0].customerId);
    const isPm = (c?.kind === "company" || (sitesPerCustomer.get(jobs[0].customerId) ?? 0) > 2) && jobs.length >= 1;
    (isPm ? multi : single).push(id);
  }
  // Prefer addresses with more jobs so the check exercises multi-visit summaries.
  const byJobs = (a: string, b: string) => (byAddress.get(b)?.length ?? 0) - (byAddress.get(a)?.length ?? 0);
  multi.sort(byJobs);
  single.sort(byJobs);
  return [...multi.slice(0, 8), ...single.slice(0, 7)];
}

async function printCheck(conn: Db, loaded: Loaded, spec: string): Promise<void> {
  const ids = spec === "auto" ? await pickCheckIds(conn, loaded) : spec.split(",").map((s) => s.trim()).filter(Boolean);
  const rows = await conn.select().from(addressDossiers).where(inArray(addressDossiers.addressId, ids));
  const byId = new Map(rows.map((r) => [r.addressId, r]));
  const byAddress = groupBy(loaded.jobs, (j) => j.addressId);
  for (const id of ids) {
    const d = byId.get(id);
    const jobs = sortJobs(byAddress.get(id) ?? []);
    const corpus = addressCorpus(loaded, id, jobs);
    console.log("\n" + "=".repeat(100));
    console.log(`${id} — ${corpus.label} — ${corpus.customer.displayName} (${corpus.customer.kind}) — ${jobs.length} job(s)`);
    console.log("=".repeat(100));
    if (!d) {
      console.log("(no dossier)");
      continue;
    }
    console.log(`SUMMARY (${wordCount(d.summaryMd ?? "")} words): ${d.summaryMd}`);
    console.log(`LAST VISIT: ${d.lastVisitAt?.toISOString().slice(0, 10) ?? "-"} — ${d.lastVisitSummary}`);
    console.log(`EQUIPMENT: ${JSON.stringify(d.equipment)}`);
    console.log(`OPEN: ${JSON.stringify(d.openIssues)}`);
    console.log(`RECURRING: ${JSON.stringify(d.recurringIssues)}`);
    console.log(`WARRANTY: ${JSON.stringify(d.warranty)}`);
    console.log(`ACCESS: ${d.accessNotes ?? "-"}`);
    console.log("-".repeat(100) + "\nSOURCE:");
    for (const j of jobs) {
      const when = (j.completedAt ?? j.scheduledStart)?.toISOString().slice(0, 10) ?? "unscheduled";
      console.log(
        `  #${j.invoiceNumber} ${when} [${j.workStatus}] techs=${j.techs.join("/") || "-"} tags=${j.tags.join("|") || "-"} ` +
          `total=$${(j.totalCents / 100).toFixed(2)} due=$${(j.outstandingCents / 100).toFixed(2)} — ${j.description ?? ""}`,
      );
      for (const it of j.items) console.log(`      item: ${it.name} $${(it.amountCents / 100).toFixed(2)}`);
      for (const n of j.notes) console.log(`      [${n.authorType}] ${redact(n.content).replace(/\s+/g, " ").trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// --copy-to-env: mirror finished rows into another database (Railway)
// ---------------------------------------------------------------------------

async function copyTo(conn: Db, envName: string): Promise<void> {
  const url = process.env[envName];
  if (!url) throw new Error(`${envName} is not set`);
  const client = postgres(url, { max: 2, prepare: false, connect_timeout: 15 });
  const target = drizzle(client, { schema });
  try {
    const [addr, cust, batches] = await Promise.all([
      conn.select().from(addressDossiers),
      conn.select().from(customerDossiers),
      conn.select().from(dossierBatches),
    ]);
    // Only rows whose parent exists on the target (FKs).
    const targetAddr = new Set((await target.select({ id: schema.addresses.id }).from(schema.addresses)).map((r) => r.id));
    const targetCust = new Set((await target.select({ id: schema.customers.id }).from(schema.customers)).map((r) => r.id));
    const addrRows = addr.filter((r) => targetAddr.has(r.addressId));
    const custRows = cust.filter((r) => targetCust.has(r.customerId));
    const CHUNK = 200;
    for (let i = 0; i < addrRows.length; i += CHUNK) {
      const chunk = addrRows.slice(i, i + CHUNK);
      await target
        .insert(addressDossiers)
        .values(chunk)
        .onConflictDoUpdate({
          target: addressDossiers.addressId,
          set: {
            summaryMd: sql`excluded.summary_md`,
            lastVisitAt: sql`excluded.last_visit_at`,
            lastVisitSummary: sql`excluded.last_visit_summary`,
            equipment: sql`excluded.equipment`,
            warranty: sql`excluded.warranty`,
            openIssues: sql`excluded.open_issues`,
            accessNotes: sql`excluded.access_notes`,
            recurringIssues: sql`excluded.recurring_issues`,
            generatedAt: sql`excluded.generated_at`,
            model: sql`excluded.model`,
          },
        });
    }
    for (let i = 0; i < custRows.length; i += CHUNK) {
      const chunk = custRows.slice(i, i + CHUNK);
      await target
        .insert(customerDossiers)
        .values(chunk)
        .onConflictDoUpdate({
          target: customerDossiers.customerId,
          set: {
            summaryMd: sql`excluded.summary_md`,
            sitesCount: sql`excluded.sites_count`,
            openBalance: sql`excluded.open_balance`,
            preferences: sql`excluded.preferences`,
            generatedAt: sql`excluded.generated_at`,
            model: sql`excluded.model`,
          },
        });
    }
    if (batches.length) {
      await target
        .insert(dossierBatches)
        .values(batches)
        .onConflictDoUpdate({
          target: dossierBatches.id,
          set: {
            status: sql`excluded.status`,
            succeeded: sql`excluded.succeeded`,
            errored: sql`excluded.errored`,
            inputTokens: sql`excluded.input_tokens`,
            outputTokens: sql`excluded.output_tokens`,
            costCents: sql`excluded.cost_cents`,
            endedAt: sql`excluded.ended_at`,
          },
        });
    }
    const [ta] = await target.select({ n: sql<number>`count(*)::int` }).from(addressDossiers);
    const [tc] = await target.select({ n: sql<number>`count(*)::int` }).from(customerDossiers);
    log(
      `copied to ${envName}: address_dossiers ${addrRows.length}/${addr.length} (target now ${ta.n}), ` +
        `customer_dossiers ${custRows.length}/${cust.length} (target now ${tc.n}), dossier_batches ${batches.length}`,
    );
    const skippedA = addr.length - addrRows.length;
    const skippedC = cust.length - custRows.length;
    if (skippedA || skippedC) log(`  skipped ${skippedA} address / ${skippedC} customer rows whose parent is missing on the target`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.status) {
    await printStatus(db, args.status);
    return;
  }
  if (args.copyToEnv) {
    await copyTo(db, args.copyToEnv);
    return;
  }
  log("loading corpus…");
  const loaded = await loadCorpus(db);
  log(`${loaded.jobs.length} jobs, ${loaded.addresses.size} addresses, ${loaded.customers.size} customers`);
  if (args.check) {
    await printCheck(db, loaded, args.check);
    return;
  }

  await resumeInFlight(db, loaded, args);

  const kinds: DossierKind[] = args.kind === "all" ? ["address", "customer"] : [args.kind];
  const submitted: { id: string; kind: DossierKind }[] = [];
  for (const kind of kinds) {
    const id = await submitKind(db, loaded, kind, args);
    if (id) submitted.push({ id, kind });
  }
  if (args.dryRun || !submitted.length) return;
  if (args.noWait) {
    log("submitted; re-run without --no-wait (or use --status <id>) to poll and ingest");
    return;
  }
  // Both batches run server-side concurrently; poll them in parallel.
  await Promise.all(submitted.map((s) => finishBatch(db, loaded, s.id, s.kind, args.pollMs)));

  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(addressDossiers);
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(customerDossiers);
  const totals = await db
    .select({
      cents: sql<number>`coalesce(sum(cost_cents),0)::int`,
      input: sql<number>`coalesce(sum(input_tokens),0)::int`,
      output: sql<number>`coalesce(sum(output_tokens),0)::int`,
    })
    .from(dossierBatches)
    .where(and(eq(dossierBatches.status, "ended")));
  log(
    `rows: address_dossiers ${a.n}, customer_dossiers ${c.n}; all ended batches: ` +
      `${totals[0].input.toLocaleString()} in / ${totals[0].output.toLocaleString()} out tokens, ${formatUsd(totals[0].cents)}`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main()
    .then(() => pg.end())
    .catch(async (e) => {
      console.error(e);
      await pg.end();
      process.exit(1);
    });
}
