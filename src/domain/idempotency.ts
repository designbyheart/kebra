/**
 * Write-tool plumbing shared by the scheduling domain (W1-B).
 *
 * `runWrite` runs a mutation inside one transaction, honours an optional
 * idempotency key (docs/TOOLS.md "Idempotency": a replay returns the stored
 * result and performs no work), and emits exactly one event once the
 * transaction has committed (docs/EVENTS.md). The event is written after the
 * commit because `emitEvent` uses the shared pool, not the transaction; an
 * event failure therefore never rolls back a booking.
 */
import { sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { calls, idempotencyKeys, users } from "@/db/schema";
import { emitEvent, type EmitEventInput } from "@/lib/events";

/** Drizzle transaction handle (same query API as `db`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Who is performing a write; mirrors ToolContext but is usable from the UI too. */
export type WriteActor = {
  actor: "agent" | "office" | "system";
  actorId?: string | null;
  callId?: string | null;
};

export function actorLabel(a: WriteActor): string {
  if (a.actor === "agent") return "Agent";
  if (a.actor === "system") return "System";
  return "Office";
}

export function actorId(a: WriteActor): string | null {
  return a.actorId ?? (a.actor === "agent" ? "vapi" : null);
}

/** `actor_label` for events: the office user's name when we know it. */
export async function actorLabelFor(exec: Tx | Db, a: WriteActor): Promise<string> {
  if (a.actor === "office" && a.actorId) {
    const [u] = await exec.select({ name: users.name }).from(users).where(sql`${users.id} = ${a.actorId}`).limit(1);
    if (u?.name) return u.name;
  }
  return actorLabel(a);
}

/**
 * `calls.id` is a foreign key on events / tasks / change_requests. The voice
 * webhook (W2-A) creates the call row before tools run, but the UI, tests and
 * ad-hoc HTTP calls may pass an id we have never seen: store null then.
 */
export async function resolveCallId(tx: Tx | Db, callId: string | null | undefined): Promise<string | null> {
  if (!callId) return null;
  const [row] = await tx.select({ id: calls.id }).from(calls).where(sql`${calls.id} = ${callId}`).limit(1);
  return row?.id ?? null;
}

export type WriteOutcome<R> = { result: R; event: EmitEventInput };

/**
 * Runs `execute` in a transaction. With an idempotency key, concurrent and
 * repeated calls with the same key are serialised on an advisory lock and
 * only the first one performs the write; the rest return its stored result.
 */
export async function runWrite<R extends Record<string, unknown>>(opts: {
  tool: string;
  idempotencyKey?: string | null;
  execute: (tx: Tx) => Promise<WriteOutcome<R>>;
}): Promise<R> {
  const key = opts.idempotencyKey?.trim() || null;

  const outcome = await db.transaction(async (tx) => {
    if (key) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`idem:${key}`}))`);
      const [hit] = await tx
        .select({ tool: idempotencyKeys.tool, result: idempotencyKeys.result })
        .from(idempotencyKeys)
        .where(sql`${idempotencyKeys.key} = ${key}`)
        .limit(1);
      if (hit) return { replay: true as const, result: hit.result as R };
    }
    const out = await opts.execute(tx);
    if (key) {
      await tx.insert(idempotencyKeys).values({ key, tool: opts.tool, result: out.result });
    }
    return { replay: false as const, ...out };
  });

  if (!outcome.replay) await emitEvent(outcome.event);
  return outcome.result;
}
