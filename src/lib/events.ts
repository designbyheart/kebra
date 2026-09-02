import { db } from "@/db";
import { events, type Event } from "@/db/schema";

export type Actor = "agent" | "office" | "system";

export type EmitEventInput = {
  actor: Actor;
  actorId?: string | null;
  type: string; // e.g. "job.created"
  entityType: string; // e.g. "job"
  entityId?: string | null;
  payload?: Record<string, unknown>;
  callId?: string | null;
};

/** Every mutation writes an event. Returns the inserted row. */
export async function emitEvent(input: EmitEventInput): Promise<Event> {
  const [row] = await db
    .insert(events)
    .values({
      actor: input.actor,
      actorId: input.actorId ?? null,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      payload: input.payload ?? {},
      callId: input.callId ?? null,
    })
    .returning();
  return row;
}
