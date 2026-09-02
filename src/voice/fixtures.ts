/**
 * Vapi server-message fixtures shaped like the real payloads
 * (ServerMessage* in https://api.vapi.ai/api-json). Used by webhook tests.
 */
import type { VapiCall, VapiMessage } from "./webhook";

export type FixtureCallOptions = {
  id: string;
  type?: "inboundPhoneCall" | "outboundPhoneCall" | "webCall";
  number?: string | null;
  startedAt?: string;
};

export function call(o: FixtureCallOptions): VapiCall {
  const type = o.type ?? "inboundPhoneCall";
  return {
    id: o.id,
    type,
    startedAt: o.startedAt ?? "2026-09-02T14:00:00.000Z",
    ...(type === "webCall" ? {} : { customer: { number: o.number ?? "+13055550142" } }),
    phoneNumber: { number: "+19346478409" },
  };
}

const ts = (c: VapiCall, seconds: number) => Date.parse(c.startedAt!) + seconds * 1000;

export function assistantRequest(c: VapiCall): VapiMessage {
  return { type: "assistant-request", call: c, timestamp: ts(c, 0) };
}

export function statusUpdate(
  c: VapiCall,
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended",
  extra: { endedReason?: string; at?: number } = {},
): VapiMessage {
  return {
    type: "status-update",
    status,
    call: c,
    timestamp: ts(c, extra.at ?? 0),
    ...(extra.endedReason ? { endedReason: extra.endedReason } : {}),
  };
}

export function transcript(
  c: VapiCall,
  role: "user" | "assistant",
  text: string,
  transcriptType: "partial" | "final" = "final",
  at = 5,
): VapiMessage {
  return { type: "transcript", role, transcript: text, transcriptType, call: c, timestamp: ts(c, at) };
}

export function toolCalls(c: VapiCall, calls: Array<{ id: string; name: string; args: unknown }>, at = 12): VapiMessage {
  return {
    type: "tool-calls",
    call: c,
    timestamp: ts(c, at),
    // Vapi sends `arguments` as a JSON string in `function`, and echoes the tool in toolWithToolCallList.
    toolCallList: calls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } })),
    toolWithToolCallList: calls.map((t) => ({
      name: t.name,
      toolCall: { id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } },
    })),
  };
}

export function endOfCallReport(
  c: VapiCall,
  o: {
    endedReason?: string;
    summary?: string;
    recordingUrl?: string;
    cost?: number;
    durationSeconds?: number;
    messages?: Array<{ role: "bot" | "user" | "system"; message: string; secondsFromStart: number }>;
  } = {},
): VapiMessage {
  const duration = o.durationSeconds ?? 95;
  return {
    type: "end-of-call-report",
    call: c,
    timestamp: ts(c, duration),
    endedReason: o.endedReason ?? "customer-ended-call",
    startedAt: c.startedAt,
    endedAt: new Date(ts(c, duration)).toISOString(),
    durationSeconds: duration,
    cost: o.cost ?? 0.1234,
    analysis: { summary: o.summary ?? "Caller at 3284 Harborlight Hollow asked about the last visit; no booking." },
    artifact: {
      recordingUrl: o.recordingUrl ?? "https://storage.vapi.ai/recordings/test.wav",
      transcript: (o.messages ?? []).map((m) => `${m.role}: ${m.message}`).join("\n"),
      messages: o.messages ?? [
        { role: "system", message: "You are Brianna.", secondsFromStart: 0 },
        { role: "bot", message: "Gulf Breeze Air, this is Brianna. What's the service address?", secondsFromStart: 1 },
        { role: "user", message: "Thirty two eighty four Harborlight Hollow.", secondsFromStart: 6 },
        { role: "bot", message: "Thirty-two eighty-four Harborlight Hollow Lane in Miami Beach?", secondsFromStart: 10 },
        { role: "user", message: "Yes.", secondsFromStart: 12 },
      ],
    },
  };
}

export function hang(c: VapiCall): VapiMessage {
  return { type: "hang", call: c, timestamp: ts(c, 30) };
}

export function transferUpdate(c: VapiCall, number = "+13055559999"): VapiMessage {
  return {
    type: "transfer-update",
    call: c,
    timestamp: ts(c, 40),
    destination: { type: "number", number, description: "The Gulf Breeze Air office" },
  };
}
