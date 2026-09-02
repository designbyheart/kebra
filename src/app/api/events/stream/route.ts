import { NextRequest } from "next/server";
import { asc, gt, max } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 1500;
const HEARTBEAT_MS = 15000;

/**
 * SSE feed of the events table. Client may pass ?since=<event id> (or the
 * Last-Event-ID header) to resume. Polls every 1.5 s; heartbeats keep proxies
 * from closing the stream.
 */
export async function GET(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get("since") ?? req.headers.get("last-event-id");
  let lastId = Number.isFinite(Number(sinceParam)) && sinceParam ? Number(sinceParam) : await latestId();

  const enc = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          closed = true;
        }
      };
      send(`retry: 2000\n: connected since=${lastId}\n\n`);

      const tick = async () => {
        if (closed) return;
        try {
          const rows = await db
            .select()
            .from(events)
            .where(gt(events.id, lastId))
            .orderBy(asc(events.id))
            .limit(200);
          for (const row of rows) {
            lastId = row.id;
            send(`id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(row)}\n\n`);
          }
        } catch (err) {
          send(`event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`);
        }
        if (!closed) timer = setTimeout(tick, POLL_MS);
      };
      timer = setTimeout(tick, 0);
      heartbeat = setInterval(() => send(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearTimeout(timer);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function latestId(): Promise<number> {
  // Start from the newest row so a fresh client only sees new events.
  const [row] = await db.select({ max: max(events.id) }).from(events);
  return row?.max ?? 0;
}
