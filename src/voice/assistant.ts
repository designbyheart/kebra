/**
 * Vapi assistant config as code (W2-A). Built from the tool registry so the
 * function schemas the model sees never drift from what the server validates.
 * Field names verified against https://api.vapi.ai/api-json on 2026-09-02.
 */
import { z } from "zod";
import { registry } from "@/agent/registry";
import { buildSystemPrompt, type PromptOptions } from "./prompt";

export const ASSISTANT_NAME = "Brianna - Gulf Breeze Air front desk";
export const FIRST_MESSAGE = "Gulf Breeze Air, this is Brianna. What's the service address I can help you with today?";
export const MODEL_PROVIDER = "anthropic";
export const MODEL = "claude-sonnet-5";
export const MODEL_FALLBACKS = ["claude-sonnet-4-6", "claude-sonnet-4-5-20250929"];
/** Built-in Vapi voice (validated against GET /voice-library/vapi): female, American. */
export const VOICE = { provider: "vapi", voiceId: "Savannah" } as const;
export const WEBHOOK_PATH = "/api/voice/webhook";
/** Vapi sends this header on every server message; we configure it via `server.headers`. */
export const SECRET_HEADER = "x-vapi-secret";
export const SERVER_MESSAGES = [
  "status-update",
  'transcript[transcriptType="final"]',
  "tool-calls",
  "end-of-call-report",
  "hang",
  "transfer-update",
] as const;
export const END_CALL_MESSAGE = "Thanks for calling Gulf Breeze Air. Take care.";
export const TRANSFER_MESSAGE = "Transferring you to the office now.";
export const MAX_DURATION_SECONDS = 15 * 60;
export const SILENCE_TIMEOUT_SECONDS = 20;
export const TOOL_TIMEOUT_SECONDS = 10;

/** Tools in the registry that the voice model should not see. */
const EXCLUDED_TOOLS = new Set(["ping"]);

/** One short spoken filler per tool (Vapi says it on request-start). */
export const FILLERS: Record<string, string> = {
  find_address: "Let me pull up that address.",
  find_customer: "Let me look that up.",
  save_caller_phone: "Saving your number.",
  get_address_dossier: "Let me check our notes for that address.",
  get_visit_history: "Let me look back through the visits.",
  get_job_notes: "Let me read what the tech wrote.",
  get_job: "Pulling up that job.",
  check_warranty: "Let me check the warranty on that.",
  get_open_balance: "Let me check the account.",
  get_schedule: "Let me look at the board.",
  find_availability: "Let me see what's open.",
  book_job: "Booking that now.",
  reschedule_job: "Moving that visit now.",
  request_cancellation: "Sending that to the office.",
  add_note: "Adding that note.",
  create_task: "Flagging that for the office.",
  web_search: "Give me a second to look that up.",
  get_weather: "Checking the forecast.",
};
const DEFAULT_FILLER = "One moment.";
const DELAYED_FILLER = "Still checking, thanks for holding.";

export type AssistantBuildOptions = {
  /** Public base URL of this app, no trailing slash. */
  appUrl: string;
  webhookSecret: string;
  /** OFFICE_HANDOFF_NUMBER (E.164). When absent the transfer tool is omitted. */
  handoffNumber?: string | null;
  model?: string;
  prompt?: Omit<PromptOptions, "handoffEnabled">;
  warn?: (msg: string) => void;
};

export type VapiFunctionTool = {
  type: "function";
  async: false;
  function: { name: string; description: string; parameters: Record<string, unknown> };
  server: { url: string; timeoutSeconds: number; headers: Record<string, string> };
  messages: Array<
    | { type: "request-start"; content: string }
    | { type: "request-response-delayed"; content: string; timingMilliseconds: number }
  >;
};

export function webhookUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${WEBHOOK_PATH}`;
}

/** zod → JSON Schema for Vapi's `function.parameters` (type/properties/required). */
export function toolParameters(schema: z.ZodTypeAny): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  if (js.type !== "object") return { type: "object", properties: {}, required: [] };
  const { type, properties, required, description } = js as {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    description?: string;
  };
  return {
    type,
    properties: properties ?? {},
    required: required ?? [],
    ...(description ? { description } : {}),
  };
}

export function buildFunctionTools(opts: Pick<AssistantBuildOptions, "appUrl" | "webhookSecret">): VapiFunctionTool[] {
  const url = webhookUrl(opts.appUrl);
  return Object.entries(registry)
    .filter(([name]) => !EXCLUDED_TOOLS.has(name))
    .map(([name, def]) => ({
      type: "function" as const,
      async: false as const,
      function: { name, description: def.description, parameters: toolParameters(def.input) },
      server: { url, timeoutSeconds: TOOL_TIMEOUT_SECONDS, headers: { [SECRET_HEADER]: opts.webhookSecret } },
      messages: [
        { type: "request-start" as const, content: FILLERS[name] ?? DEFAULT_FILLER },
        { type: "request-response-delayed" as const, content: DELAYED_FILLER, timingMilliseconds: 3000 },
      ],
    }));
}

export function buildTransferTool(handoffNumber: string) {
  return {
    type: "transferCall" as const,
    destinations: [
      {
        type: "number" as const,
        number: handoffNumber,
        description:
          "The Gulf Breeze Air office (a person). Use for safety issues after giving the safety instruction, billing disputes, " +
          "complaints about a technician, legal or insurance questions, when the caller asks for a person a second time, or " +
          "after three failed attempts to identify the caller.",
        message: TRANSFER_MESSAGE,
        transferPlan: {
          mode: "warm-transfer-say-summary" as const,
          summaryPlan: {
            enabled: true,
            messages: [
              {
                role: "system",
                content:
                  "You are the front desk handing a caller to the office. In two short sentences say who is calling, the " +
                  "service address, and what they need. Say nothing else.",
              },
              { role: "user", content: "Here is the transcript:\n\n{{transcript}}\n\n" },
            ],
          },
          fallbackPlan: {
            message: "The office isn't picking up right now. Let me take your details and have them call you back.",
            endCallEnabled: false,
          },
        },
      },
    ],
    messages: [{ type: "request-start" as const, content: TRANSFER_MESSAGE }],
  };
}

export type VapiAssistantConfig = ReturnType<typeof buildAssistantConfig>;

export function buildAssistantConfig(opts: AssistantBuildOptions) {
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const url = webhookUrl(opts.appUrl);
  const handoffEnabled = Boolean(opts.handoffNumber && /^\+\d{8,15}$/.test(opts.handoffNumber));
  if (opts.handoffNumber && !handoffEnabled) {
    warn(`OFFICE_HANDOFF_NUMBER is not E.164 (+1...); transfer tool omitted.`);
  } else if (!opts.handoffNumber) {
    warn("OFFICE_HANDOFF_NUMBER is not set; the transferCall tool is omitted (agent will open handoff tasks instead). Re-run vapi:sync once it is set.");
  }

  const tools: unknown[] = [...buildFunctionTools(opts), { type: "endCall" }];
  if (handoffEnabled) tools.push(buildTransferTool(opts.handoffNumber!));

  const systemPrompt = buildSystemPrompt({ ...(opts.prompt ?? {}), handoffEnabled });

  return {
    name: ASSISTANT_NAME,
    firstMessage: FIRST_MESSAGE,
    firstMessageMode: "assistant-speaks-first" as const,
    model: {
      provider: MODEL_PROVIDER,
      model: opts.model ?? MODEL,
      temperature: 0.3,
      maxTokens: 250,
      messages: [{ role: "system", content: systemPrompt }],
      tools,
    },
    voice: { ...VOICE },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "en",
      smartFormat: true,
      // 300 ms trades a little latency for fewer clipped one-word answers ("yes", unit letters).
      endpointing: 300,
    },
    startSpeakingPlan: {
      waitSeconds: 0.5,
      smartEndpointingPlan: { provider: "livekit" },
    },
    stopSpeakingPlan: { numWords: 2, voiceSeconds: 0.25, backoffSeconds: 1 },
    serverMessages: [...SERVER_MESSAGES],
    server: { url, timeoutSeconds: 20, headers: { [SECRET_HEADER]: opts.webhookSecret } },
    maxDurationSeconds: MAX_DURATION_SECONDS,
    backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
    // `silenceTimeoutSeconds` is no longer an assistant field; the speech-timeout hook covers it.
    hooks: [
      {
        on: "customer.speech.timeout",
        options: { timeoutSeconds: SILENCE_TIMEOUT_SECONDS, triggerMaxCount: 2, triggerResetMode: "onUserSpeech" },
        do: [{ type: "say", exact: "Are you still there? Take your time, I'm here." }],
      },
    ],
    endCallMessage: END_CALL_MESSAGE,
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system",
            content:
              "Summarize this front-desk call for the office in 2-3 sentences: who called, the service address, what they " +
              "needed, what was booked, moved, noted or promised, and anything the office must follow up. No preamble.",
          },
          { role: "user", content: "Here is the transcript:\n\n{{transcript}}\n\n" },
        ],
      },
    },
    metadata: { app: "kebra", managedBy: "scripts/vapi-sync.ts", handoffEnabled },
  };
}

/** Names of the function tools the model sees (for diffs and tests). */
export function assistantToolNames(config: { model: { tools: unknown[] } }): string[] {
  return config.model.tools
    .map((t) => {
      const tool = t as { type: string; function?: { name: string } };
      return tool.type === "function" ? tool.function!.name : tool.type;
    })
    .sort();
}
