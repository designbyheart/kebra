import { describe, expect, it } from "vitest";
import { registry } from "@/agent/registry";
import {
  assistantToolNames,
  buildAssistantConfig,
  FIRST_MESSAGE,
  SECRET_HEADER,
  toolParameters,
  type VapiFunctionTool,
} from "./assistant";
import { buildSystemPrompt, describeHours, DEFAULT_HOURS, wordCount } from "./prompt";

const base = { appUrl: "https://kebra.example.com/", webhookSecret: "s3cret" };

describe("assistant config", () => {
  it("is built from the registry: every tool except ping, with server url, secret header, filler and schema", () => {
    const warnings: string[] = [];
    const cfg = buildAssistantConfig({ ...base, handoffNumber: null, warn: (m) => warnings.push(m) });
    const fns = cfg.model.tools.filter((t) => (t as { type: string }).type === "function") as VapiFunctionTool[];
    const expected = Object.keys(registry).filter((n) => n !== "ping").sort();
    expect(fns.map((f) => f.function.name).sort()).toEqual(expected);
    for (const f of fns) {
      expect(f.async).toBe(false);
      expect(f.server.url).toBe("https://kebra.example.com/api/voice/webhook");
      expect(f.server.headers[SECRET_HEADER]).toBe("s3cret");
      expect(f.server.timeoutSeconds).toBe(10);
      expect(f.function.description).toBe(registry[f.function.name].description);
      expect(f.function.parameters.type).toBe("object");
      expect("$schema" in f.function.parameters).toBe(false);
      const start = f.messages.find((m) => m.type === "request-start");
      expect(start?.content.length).toBeGreaterThan(5);
      expect(start?.content.length).toBeLessThan(60);
    }
    expect(cfg.model.tools.some((t) => (t as { type: string }).type === "endCall")).toBe(true);
    expect(cfg.model.tools.some((t) => (t as { type: string }).type === "transferCall")).toBe(false);
    expect(warnings.join(" ")).toMatch(/OFFICE_HANDOFF_NUMBER/);
  });

  it("adds the warm transfer tool when OFFICE_HANDOFF_NUMBER is set", () => {
    const cfg = buildAssistantConfig({ ...base, handoffNumber: "+13055550100", warn: () => undefined });
    const transfer = cfg.model.tools.find((t) => (t as { type: string }).type === "transferCall") as ReturnType<
      typeof import("./assistant").buildTransferTool
    >;
    expect(transfer).toBeDefined();
    expect(transfer.destinations[0].number).toBe("+13055550100");
    expect(transfer.destinations[0].message).toBe("Transferring you to the office now.");
    expect(transfer.destinations[0].transferPlan.mode).toMatch(/^warm-transfer/);
    expect(assistantToolNames(cfg)).toContain("transferCall");
    expect(cfg.metadata.handoffEnabled).toBe(true);
    expect(buildSystemPrompt({ handoffEnabled: true })).toContain("transferCall");
    expect(buildSystemPrompt({ handoffEnabled: false })).not.toContain("transferCall");
  });

  it("pins the model, voice, first message, server messages and limits from the brief", () => {
    const cfg = buildAssistantConfig({ ...base, warn: () => undefined });
    expect(cfg.model.provider).toBe("anthropic");
    expect(cfg.model.model).toBe("claude-sonnet-5");
    expect(cfg.model.temperature).toBe(0.3);
    expect(cfg.model.maxTokens).toBe(250);
    expect(cfg.voice).toEqual({ provider: "vapi", voiceId: "Savannah" });
    expect(cfg.firstMessage).toBe(FIRST_MESSAGE);
    expect(cfg.serverMessages).toEqual(
      expect.arrayContaining(["status-update", "tool-calls", "end-of-call-report", "hang", 'transcript[transcriptType="final"]']),
    );
    expect(cfg.server.url).toBe("https://kebra.example.com/api/voice/webhook");
    expect(cfg.maxDurationSeconds).toBe(900);
    expect(cfg.hooks[0].options.timeoutSeconds).toBe(20);
    expect(cfg.backgroundSpeechDenoisingPlan.smartDenoisingPlan.enabled).toBe(true);
    expect(cfg.model.messages[0].role).toBe("system");
  });

  it("serializes cleanly (no undefined / functions) for the Vapi API", () => {
    const cfg = buildAssistantConfig({ ...base, handoffNumber: "+13055550100", warn: () => undefined });
    const round = JSON.parse(JSON.stringify(cfg));
    expect(assistantToolNames(round)).toEqual(assistantToolNames(cfg));
  });
});

describe("toolParameters", () => {
  it("marks optional fields optional and keeps descriptions", () => {
    const p = toolParameters(registry.find_address.input) as { required: string[]; properties: Record<string, { description?: string }> };
    expect(p.required).toEqual(["query"]);
    expect(Object.keys(p.properties)).toEqual(expect.arrayContaining(["query", "unit", "city", "customer_id"]));
    expect(p.properties.customer_id.description).toBeTruthy();
  });
});

describe("system prompt", () => {
  it("stays under the budget and covers the operations manual", () => {
    const p = buildSystemPrompt({ handoffEnabled: true });
    expect(wordCount(p)).toBeLessThan(1400);
    for (const must of [
      "{{now_et}}",
      "{{caller_name}}",
      "{{known_sites}}",
      "find_address",
      "get_address_dossier",
      "check_warranty",
      "find_availability",
      "book_job",
      "reschedule_job",
      "request_cancellation",
      "add_note",
      "create_task",
      "save_caller_phone",
      "get_schedule",
      "web_search",
      "gas smell",
      "door or gate codes",
      "Monday to Friday 8 AM to 6 PM",
      "Saturday 8 AM to 2 PM",
      "closed Sunday",
      "14 technicians",
      "two hours",
      "office will confirm",
      "live",
    ]) {
      expect(p, must).toContain(must);
    }
  });

  it("describes hours from rows", () => {
    expect(describeHours(DEFAULT_HOURS!)).toBe("closed Sunday, Monday to Friday 8 AM to 6 PM, Saturday 8 AM to 2 PM");
    expect(describeHours([{ dow: 1, open: "07:30", close: "17:00", closed: false }])).toBe("Monday 7:30 AM to 5 PM");
  });
});
