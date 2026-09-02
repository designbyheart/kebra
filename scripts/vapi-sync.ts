/**
 * pnpm vapi:sync [--app-url https://...] [--static] [--dry-run]
 *
 * Creates or updates the Vapi assistant from src/voice/assistant.ts (built off
 * the tool registry), stores VAPI_ASSISTANT_ID in .env on first run, and
 * points the phone number at this app. Idempotent: re-run whenever tools,
 * the prompt, APP_URL or OFFICE_HANDOFF_NUMBER change.
 *
 * Phone-number routing:
 *   default   number.server = <app>/api/voice/webhook and no assistantId, so Vapi
 *             sends `assistant-request` and the webhook answers with the assistant
 *             id plus caller_name / known_sites / now_et for returning callers.
 *   --static  number.assistantId = <id> (no caller recognition; use if the webhook
 *             is unreachable for some reason).
 */
import "dotenv/config";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  assistantToolNames,
  buildAssistantConfig,
  MODEL,
  MODEL_FALLBACKS,
  SECRET_HEADER,
  webhookUrl,
  type VapiAssistantConfig,
} from "@/voice/assistant";
import type { PromptOptions } from "@/voice/prompt";

type Args = { appUrl?: string; static: boolean; dryRun: boolean; help: boolean };

function parseArgs(argv: string[]): Args {
  const out: Args = { static: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--app-url") out.appUrl = argv[++i];
    else if (a.startsWith("--app-url=")) out.appUrl = a.slice("--app-url=".length);
    else if (a === "--static") out.static = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

function apiBase(): string {
  const raw = (process.env.VAPI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "https://api.vapi.ai";
  try {
    const host = new URL(raw).host;
    if (host === "api.vapi.ai" || host.startsWith("api.")) return raw;
  } catch {
    /* fall through */
  }
  console.warn(`! VAPI_BASE_URL=${raw} is not the API host; using https://api.vapi.ai`);
  return "https://api.vapi.ai";
}
const BASE = apiBase();

class VapiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
    message: string,
  ) {
    super(message);
  }
}

async function vapi<T = unknown>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${need("VAPI_PRIVATE_KEY")}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const detail = json as { message?: unknown; error?: string } | null;
    const msg = Array.isArray(detail?.message) ? detail!.message.join("; ") : String(detail?.message ?? text);
    throw new VapiError(res.status, json, `${method} ${p} → ${res.status}: ${msg}`);
  }
  return json as T;
}

type RemoteAssistant = {
  id: string;
  name?: string;
  firstMessage?: string;
  model?: { provider?: string; model?: string; messages?: Array<{ role: string; content: string }>; tools?: unknown[] };
  voice?: { provider?: string; voiceId?: string };
  server?: { url?: string };
  serverMessages?: string[];
  maxDurationSeconds?: number;
};

type RemoteNumber = { id: string; number?: string; assistantId?: string | null; server?: { url?: string } | null; name?: string };

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);

function systemPrompt(cfg: { model: { messages: Array<{ role: string; content: string }> } }): string {
  return cfg.model.messages.find((m) => m.role === "system")?.content ?? "";
}

function diffLines(remote: RemoteAssistant | null, desired: VapiAssistantConfig): string[] {
  const lines: string[] = [];
  const row = (k: string, a: unknown, b: unknown) => {
    const same = JSON.stringify(a) === JSON.stringify(b);
    lines.push(`${same ? "=" : "~"} ${k}: ${same ? String(b) : `${String(a)} → ${String(b)}`}`);
  };
  if (!remote) {
    lines.push("+ assistant (new)");
    return lines;
  }
  row("model", `${remote.model?.provider}/${remote.model?.model}`, `${desired.model.provider}/${desired.model.model}`);
  row("voice", `${remote.voice?.provider}/${remote.voice?.voiceId}`, `${desired.voice.provider}/${desired.voice.voiceId}`);
  row("firstMessage", remote.firstMessage, desired.firstMessage);
  row("server.url", remote.server?.url, desired.server.url);
  row("serverMessages", (remote.serverMessages ?? []).join(","), desired.serverMessages.join(","));
  row("maxDurationSeconds", remote.maxDurationSeconds, desired.maxDurationSeconds);
  const remotePrompt = remote.model?.messages?.find((m) => m.role === "system")?.content ?? "";
  row("systemPrompt (sha)", sha(remotePrompt), sha(systemPrompt(desired)));
  const before = new Set(assistantToolNames({ model: { tools: remote.model?.tools ?? [] } }));
  const after = new Set(assistantToolNames(desired));
  const added = [...after].filter((t) => !before.has(t));
  const removed = [...before].filter((t) => !after.has(t));
  lines.push(`${added.length || removed.length ? "~" : "="} tools: ${after.size} total` +
    (added.length ? `, +${added.join(",")}` : "") + (removed.length ? `, -${removed.join(",")}` : ""));
  return lines;
}

async function loadPromptFacts(): Promise<Omit<PromptOptions, "handoffEnabled">> {
  if (!process.env.DATABASE_URL) return {};
  try {
    const { db, sql } = await import("@/db");
    const { businessHours, serviceTypes } = await import("@/db/schema");
    const [hours, types] = await Promise.all([db.select().from(businessHours), db.select().from(serviceTypes)]);
    await sql.end({ timeout: 2 }).catch(() => undefined);
    return {
      hours: hours.length ? hours : undefined,
      serviceTypes: types.length ? types.filter((t) => t.active) : undefined,
    };
  } catch (err) {
    console.warn(`! could not read business_hours/service_types from DB (${(err as Error).message}); using defaults`);
    return {};
  }
}

function persistAssistantId(id: string) {
  const envPath = path.resolve(process.cwd(), ".env");
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (/^VAPI_ASSISTANT_ID=/m.test(current)) {
    console.log(`! .env already has VAPI_ASSISTANT_ID; set it to ${id} by hand if it differs`);
    return;
  }
  appendFileSync(envPath, `${current.endsWith("\n") || current === "" ? "" : "\n"}VAPI_ASSISTANT_ID=${id}\n`);
  console.log(`+ wrote VAPI_ASSISTANT_ID to .env`);
}

async function upsertAssistant(desired: VapiAssistantConfig, existingId: string | null) {
  const models = [desired.model.model, ...MODEL_FALLBACKS.filter((m) => m !== desired.model.model)];
  let lastErr: unknown;
  for (const model of models) {
    const body = { ...desired, model: { ...desired.model, model } };
    try {
      const res = existingId
        ? await vapi<RemoteAssistant>("PATCH", `/assistant/${existingId}`, body)
        : await vapi<RemoteAssistant>("POST", "/assistant", body);
      if (model !== MODEL) console.log(`! Vapi rejected model "${MODEL}"; using "${model}"`);
      return { res, model };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof VapiError && err.status === 400 && /model/i.test(msg) && !/tools|messages|voice/i.test(msg)) {
        console.log(`! ${msg}`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("usage: pnpm vapi:sync [--app-url https://host] [--static] [--dry-run]");
    return;
  }
  const appUrl = (args.appUrl ?? process.env.APP_URL ?? "").replace(/\/+$/, "");
  if (!appUrl) throw new Error("APP_URL is not set; pass --app-url https://your-host");
  if (/localhost|127\.0\.0\.1/.test(appUrl)) {
    console.error(
      `APP_URL is ${appUrl}; Vapi cannot reach it. For local testing run\n` +
        `  cloudflared tunnel --url http://localhost:3000\n` +
        `and re-run with --app-url https://<something>.trycloudflare.com`,
    );
    process.exit(2);
  }
  const secret = need("VAPI_WEBHOOK_SECRET");
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID ?? null;
  const handoffNumber = process.env.OFFICE_HANDOFF_NUMBER?.trim() || null;

  const facts = await loadPromptFacts();
  const desired = buildAssistantConfig({
    appUrl,
    webhookSecret: secret,
    handoffNumber,
    prompt: { ...facts, phoneNumber: process.env.VAPI_PHONE_NUMBER ?? undefined },
    warn: (m) => console.warn(`! ${m}`),
  });

  console.log(`assistant: ${desired.name}`);
  console.log(`webhook:   ${webhookUrl(appUrl)} (header ${SECRET_HEADER})`);
  console.log(`tools:     ${assistantToolNames(desired).join(", ")}`);
  console.log(`prompt:    ${systemPrompt(desired).split(/\s+/).length} words, sha ${sha(systemPrompt(desired))}`);

  if (args.dryRun) {
    console.log("(dry run; no API calls)");
    return;
  }

  let existingId = process.env.VAPI_ASSISTANT_ID ?? null;
  let remote: RemoteAssistant | null = null;
  if (existingId) {
    try {
      remote = await vapi<RemoteAssistant>("GET", `/assistant/${existingId}`);
    } catch (err) {
      if (err instanceof VapiError && err.status === 404) {
        console.log(`! VAPI_ASSISTANT_ID ${existingId} not found on Vapi; creating a new assistant`);
        existingId = null;
      } else throw err;
    }
  }

  console.log("\ndiff:");
  for (const l of diffLines(remote, desired)) console.log(`  ${l}`);

  const { res: saved, model } = await upsertAssistant(desired, existingId);
  console.log(`\n${existingId ? "updated" : "created"} assistant ${saved.id} (model ${saved.model?.model ?? model}, voice ${saved.voice?.voiceId})`);
  if (!existingId) {
    persistAssistantId(saved.id);
    process.env.VAPI_ASSISTANT_ID = saved.id;
    console.log(`! set it on Railway too: railway variables --set VAPI_ASSISTANT_ID=${saved.id}`);
  }

  if (!phoneNumberId) {
    console.log("! VAPI_PHONE_NUMBER_ID not set; skipped phone-number attachment");
    return;
  }
  const numberServer = { url: webhookUrl(appUrl), timeoutSeconds: 10, headers: { [SECRET_HEADER]: secret } };
  const numberBody: Record<string, unknown> = { name: "Gulf Breeze Air front desk", server: numberServer };
  numberBody.assistantId = args.static ? saved.id : null;
  let num: RemoteNumber;
  try {
    num = await vapi<RemoteNumber>("PATCH", `/phone-number/${phoneNumberId}`, numberBody);
  } catch (err) {
    if (err instanceof VapiError && err.status === 400 && /assistantId/.test(err.message) && !args.static) {
      delete numberBody.assistantId;
      num = await vapi<RemoteNumber>("PATCH", `/phone-number/${phoneNumberId}`, numberBody);
    } else throw err;
  }
  const mode = num.assistantId ? `static assistantId=${num.assistantId}` : "assistant-request via server.url";
  console.log(`phone ${num.number ?? phoneNumberId}: ${mode}; server.url=${num.server?.url ?? "(none)"}`);
  if (!args.static && num.assistantId) {
    console.log("! number still has a static assistantId; Vapi will not send assistant-request. Clear it in the dashboard or pass --static.");
  }
  console.log("\ndone.");
}

main().catch((err) => {
  console.error(err instanceof VapiError ? `${err.message}\n${JSON.stringify(err.detail, null, 2)}` : err);
  process.exit(1);
});
