import { z } from "zod";
import { formatDateTimeET, BUSINESS_TZ } from "@/lib/time";

export type ToolContext = {
  /** Vapi call id when invoked from a live call; null from the UI / tests. */
  callId: string | null;
  /** Who is acting: the voice agent or an office user. */
  actor: "agent" | "office";
  actorId?: string | null;
};

export type ToolDef<I extends z.ZodTypeAny = z.ZodTypeAny, O = unknown> = {
  description: string;
  input: I;
  handler: (input: z.infer<I>, ctx: ToolContext) => Promise<O>;
};

/** Helper to keep inference tight when registering. */
export function defineTool<I extends z.ZodTypeAny, O>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def;
}

/**
 * The ONE tool contract. Every capability the voice agent has is an entry
 * here, exposed at POST /api/agent/tools/<name>. The office UI calls the same
 * domain functions these handlers wrap. Wave 1 agents add entries below.
 */
export const registry: Record<string, ToolDef> = {
  ping: defineTool({
    description: "Health probe. Returns the current server time in Eastern Time.",
    input: z.object({ echo: z.string().max(200).optional() }).default({}),
    handler: async (input) => {
      const now = new Date();
      return {
        pong: true,
        echo: input.echo ?? null,
        tz: BUSINESS_TZ,
        nowET: formatDateTimeET(now),
        nowISO: now.toISOString(),
      };
    },
  }),
};

export type ToolName = keyof typeof registry;

export function listTools() {
  return Object.entries(registry).map(([name, t]) => ({ name, description: t.description }));
}
