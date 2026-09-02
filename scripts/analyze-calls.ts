/**
 * pnpm analyze-calls — run end-of-call analysis (W3-A) for every ended call
 * that has no `call.analyzed` event yet.
 *
 *   pnpm analyze-calls                      backfill everything pending
 *   pnpm analyze-calls -- --limit 5         at most 5 calls
 *   pnpm analyze-calls -- --call <id>       one call (re-runs even if analyzed)
 *   pnpm analyze-calls -- --dry-run         print the request(s) we would send; call nothing
 *
 * Idempotent: a second run finds nothing pending and writes nothing. Costs are
 * logged per call (tokens + cents) and summed at the end.
 */
import "dotenv/config";
import { sql as pg } from "../src/db";
import { addUsage, costCents, formatUsd, ZERO_USAGE, type TokenUsage } from "../src/lib/anthropic";
import { analyzeCall, AnalysisError, buildAnalysisRequest, listUnanalyzedCallIds, loadCorpus } from "../src/voice/analyze-call";

type Args = { limit: number; call?: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const a: Args = { limit: 500, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${k} needs a value`);
      return x;
    };
    if (k === "--") continue; // pnpm passes the separator through
    if (k === "--limit") a.limit = Number(v());
    else if (k === "--call") a.call = v();
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--help" || k === "-h") {
      console.log("usage: pnpm analyze-calls [--limit N] [--call <id>] [--dry-run]");
      process.exit(0);
    } else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ids = args.call ? [args.call] : await listUnanalyzedCallIds(args.limit);
  if (ids.length === 0) {
    console.log("nothing to analyze: every ended call already has a call.analyzed event");
    return;
  }
  console.log(`${args.dryRun ? "would analyze" : "analyzing"} ${ids.length} call${ids.length === 1 ? "" : "s"}`);

  if (args.dryRun) {
    for (const id of ids) {
      const corpus = await loadCorpus(id);
      if (!corpus) {
        console.log(`-- ${id}: not found`);
        continue;
      }
      const req = buildAnalysisRequest(corpus);
      const approxTokens = Math.round(JSON.stringify(req).length / 3.5);
      console.log(`\n===== ${id} (~${approxTokens} input tokens, ${corpus.call.transcript.length} turns, ${corpus.events.length} events) =====`);
      console.log(JSON.stringify(req, null, 2));
    }
    console.log("\n(dry run: no request was sent)");
    return;
  }

  let total: TokenUsage = ZERO_USAGE;
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const r = await analyzeCall(id, { force: Boolean(args.call) });
      if (r.status === "analyzed") {
        ok++;
        total = addUsage(total, r.usage);
        console.log(`${id}: ${r.analysis.outcome}${r.analysis.needs_review ? " (needs review)" : ""}, ${r.analysis.promises.length} promise(s)${r.taskId ? `, task ${r.taskId}` : ""}, ${r.usage.input_tokens}+${r.usage.output_tokens} tok, ${formatUsd(r.costCents)}, ${r.ms} ms`);
      } else {
        console.log(`${id}: ${r.status}${"reason" in r ? ` (${r.reason})` : ""}`);
      }
    } catch (err) {
      failed++;
      if (err instanceof AnalysisError) console.error(`${id}: ${err.code}: ${err.message}`);
      else console.error(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\ndone: ${ok} analyzed, ${failed} failed, ${total.input_tokens} in / ${total.output_tokens} out tokens, ${formatUsd(costCents(total))} total`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pg.end({ timeout: 5 }));
