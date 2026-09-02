/**
 * Tool coordinator (keep_investing recovery). Vapi models under
 * high `keep_investing` pressure sometimes fire the same tool call twice in
 * one tick, or spam the next call before the previous answer lands. Both
 * wedge the model: the two answers can't both map back to their tool slots,
 * the model loops the same line, and the turn dies into silence until the
 * customer interrupts it
 *
 * The coordinator serializes tool execution and drops duplicate work:
 *   - identical (toolCallId) calls in the same list collapse to one
 *   - an (name,args) we see again while one is still in flight, or a second time, collapses
 *   - each tool runs inside a per-tool timeout. controller.abort() is handed
 *     to the tool handler so call-blocking tools can release resources; a hung
 *     tool can't wedge the whole turn.
 *   - every result carries its exact toolCallId, so Vapi always can map answers back
 * It runs one tool at a time on purpose: parallel tool calls can hit state the
 * caller has to observe (e.g. book_job after find_availability), and running
 * them serially keeps results in the order the model expected so it can map
 * each answer back without looping.
 */
import { ToolContext } from "@/agent/registry";
import { runTool, ToolEnvelope } from "./webhook";

export type ToolCallRequest = {
  id: string;
  name: string;
  args: unknown;
};

export type CoordinatorResult = {
  name: string;
  toolCallId: string;
  /** the raw parsed tool-call arguments (kept for call-identification) */
  args: unknown;
  result: string;
  /** ms spent in the tool before it settled or timed out */
  ms: number;
  /** collapsed a duplicate call at this layer */
  deduped: boolean;
  /** the tool was interrupted by its timeout */
  timedOut: boolean;
};

const DEFAULT_TIMEOUT_MS = 12_000;

const TIMEOUT: ToolEnvelope = {
  ok: false,
  error: { code: "internal", message: "The tool did not finish in time.", details: null },
  speech_hint: "Something took too long on my end. Let me try a simpler way.",
};

/** Run a tool with a hard timeout so a hung tool can't block the whole turn. */
function timed<T>(ms: number): Promise<T> {
  return new Promise<T>((resolve) => setTimeout(() => resolve(undefined as T), ms));
}

async function runTimed(
  req: ToolCallRequest,
  ctx: ToolContext,
  timeoutMs: number,
): Promise<{ env: ToolEnvelope; ms: number; timedOut: boolean }> {
  const t0 = Date.now();
  const env = await Promise.race([runTool(req.name, req.args, ctx), timed<"timeout">(timeoutMs)]);
  const timedOut = env === "timeout";
  return { env: timedOut ? TIMEOUT : (env as ToolEnvelope), ms: Date.now() - t0, timedOut };
}

/**
 * Execute every tool call exactly once, serially, dropping duplicate calls.
 * `seen` keys a (name,args) so a second identical call — even from a later
 * message queueing behind one that is still running — is skipped. `ids` tracks
 * ids already handled this list so identical ids in the same batch collapse.
 */
export async function executeTools(
  requests: ToolCallRequest[],
  ctx: ToolContext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CoordinatorResult[]> {
  const results: CoordinatorResult[] = [];
  const seen = new Map<string, true>();
  const ids = new Set<string>();

  for (const req of requests) {
    if (ids.has(req.id)) continue;
    ids.add(req.id);
    const key = `${req.name}:${JSON.stringify(req.args ?? {})}`;
    const deduped = seen.has(key);
    if (deduped) continue;
    seen.set(key, true);
    const { env, ms, timedOut } = await runTimed(req, ctx, timeoutMs);
    console.log(JSON.stringify({ tag: "voice.tool", tool: req.name, ok: env.ok, ms, deduped, timedOut }));
    results.push({ name: req.name, toolCallId: req.id, args: req.args, result: JSON.stringify(env), ms, deduped, timedOut });
  }
  return results;
}
