import { desc } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import type { LiveEvent } from "@/lib/use-live-events";
import { ActivityStripClient } from "@/components/activity-strip-client";

/**
 * Activity strip: the last N events, live. Server component — loads the
 * initial rows, then the client half subscribes to the SSE feed and
 * prepends. Mount it from any server page:
 *
 *   <ActivityStrip className="xl:w-80" />
 */
export async function ActivityStrip({
  limit = 20,
  className,
  title = "Activity",
}: {
  limit?: number;
  className?: string;
  title?: string;
}) {
  let initial: LiveEvent[] = [];
  let error: string | null = null;
  try {
    const rows = await db.select().from(events).orderBy(desc(events.id)).limit(limit);
    initial = rows.map((r) => ({
      id: r.id,
      ts: r.ts.toISOString(),
      actor: r.actor,
      actorId: r.actorId,
      callId: r.callId,
      type: r.type,
      entityType: r.entityType,
      entityId: r.entityId,
      payload: r.payload ?? {},
    }));
  } catch (err) {
    console.error("[activity-strip]", err);
    error = "Activity is unavailable right now.";
  }
  return <ActivityStripClient initial={initial} limit={limit} className={className} title={title} error={error} />;
}
