"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, ArrowUpRight, CalendarPlus, CheckCircle2, ClipboardList, FileText, Phone, StickyNote, UserCheck, Wrench, XCircle } from "lucide-react";
import type { CallDetail as CallDetailData } from "@/app/calls/data";
import { formatDateTimeET, formatTimeET } from "@/lib/time";
import { cn } from "@/lib/utils";
import { buildTimeline, durationSeconds, endedReasonLabel, formatDuration, formatOffset, isLive, outcomeLabel, outcomeTone, STATUS_LABEL, type ActionKind, type TimelineItem } from "./derive";
import { AgentBadge, LiveDot, SectionTitle } from "./bits";
import { useCallFeed, useNow } from "./use-call-feed";
import { ReviewControls } from "./review-controls";

export function CallDetail({ initial }: { initial: CallDetailData }) {
  const [version, setVersion] = useState(0);
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await fetch(`/api/calls/${initial.id}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`refresh failed (${res.status})`);
      const json = (await res.json()) as { ok: boolean; call: CallDetailData };
      return json.ok ? json.call : null;
    },
    [initial.id],
  );
  const [pollMs, setPollMs] = useState(isLive(initial.status) ? 2000 : 10000);
  const { data: call, lastRefreshAt, sse } = useCallFeed<CallDetailData>({
    initial,
    fetcher,
    intervalMs: pollMs,
    callId: initial.id,
    version,
  });
  const live = isLive(call.status);
  // Poll fast only while the call is live; the change is driven by fetched data, not by an effect.
  const wantMs = live ? 2000 : 10000;
  if (wantMs !== pollMs) setPollMs(wantMs);
  const now = useNow(1000, live);
  const secs = durationSeconds(call.startedAt, call.endedAt, new Date(now));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0">
        <SectionTitle
          aside={
            <span className="text-xs text-muted-foreground">
              {call.transcript.length} turn{call.transcript.length === 1 ? "" : "s"} · {call.toolCalls.length} tool call{call.toolCalls.length === 1 ? "" : "s"}
              {live ? " · refreshing every 2 s" : ""}
              {sse === "open" ? " · feed connected" : ""}
              {lastRefreshAt ? ` · ${formatTimeET(lastRefreshAt)}` : ""}
            </span>
          }
        >
          Transcript
        </SectionTitle>
        <Transcript call={call} live={live} />
        {call.recordingUrl ? (
          <div className="mt-3 rounded-lg border bg-card p-3">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recording</div>
            <audio controls preload="none" src={call.recordingUrl} className="h-9 w-full" />
          </div>
        ) : null}
      </section>

      <aside className="space-y-5">
        <Header call={call} secs={secs} live={live} />
        <ReviewControls call={call} onChanged={() => setVersion((v) => v + 1)} />
        <Actions call={call} />
        <Promises call={call} live={live} />
        <Summary call={call} live={live} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Transcript({ call, live }: { call: CallDetailData; live: boolean }) {
  const items = useMemo(() => buildTimeline(call.transcript, call.toolCalls), [call.transcript, call.toolCalls]);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = call.transcript.length + call.toolCalls.length;

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (live && stick.current) el.scrollTop = el.scrollHeight;
  }, [count, live]);

  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        {live ? (
          <span className="inline-flex items-center gap-2">
            <LiveDot /> Waiting for the first words…
          </span>
        ) : (
          "No transcript was captured for this call."
        )}
      </div>
    );
  }

  return (
    <div ref={box} onScroll={onScroll} className={cn("space-y-3 overflow-y-auto rounded-lg border bg-card p-4", live ? "max-h-[70vh]" : "max-h-[78vh]")} aria-live={live ? "polite" : undefined}>
      {items.map((item, i) => (
        <TimelineRow key={i} item={item} />
      ))}
      {live ? (
        <div className="flex items-center gap-2 pt-1 text-xs text-amber-700 dark:text-amber-400">
          <LiveDot /> Live — {STATUS_LABEL[call.status] ?? call.status}
        </div>
      ) : null}
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  if (item.kind === "tool") {
    return (
      <div className="flex justify-center">
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-xs text-muted-foreground",
            item.call.ok === false && "border-red-300 text-red-700 dark:text-red-300",
          )}
          title={`${item.call.name} @ ${formatOffset(item.t)}`}
        >
          <Wrench className="size-3 shrink-0" />
          <span className="truncate">{item.label}</span>
        </span>
      </div>
    );
  }
  if (item.kind === "system") {
    return (
      <div className="flex justify-center">
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={formatOffset(item.t)}>
          <ArrowRightLeft className="size-3 shrink-0" />
          <span className="truncate">{item.text}</span>
        </span>
      </div>
    );
  }
  const agent = item.role === "assistant";
  return (
    <div className={cn("flex", agent ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[78%] space-y-1", agent ? "items-start" : "items-end")}>
        <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", agent ? "" : "justify-end")}>
          {agent ? <AgentBadge /> : <span className="font-medium text-foreground">Caller</span>}
          <span className="tabular-nums">{formatOffset(item.t)}</span>
        </div>
        {item.turns.map((turn, i) => (
          <p
            key={i}
            className={cn(
              "rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
              agent ? "rounded-tl-sm bg-teal-50 text-teal-950 dark:bg-teal-950/40 dark:text-teal-50" : "rounded-tr-sm bg-muted text-foreground",
            )}
            title={formatOffset(turn.t)}
          >
            {turn.text}
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header({ call, secs, live }: { call: CallDetailData; secs: number; live: boolean }) {
  const outcome = outcomeLabel(call.outcome);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {live ? <LiveDot /> : <Phone className="size-3.5 text-muted-foreground" />}
            <span className="font-mono text-sm">{call.caller}</span>
            <span className="text-xs text-muted-foreground capitalize">{call.direction}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{formatDateTimeET(call.startedAt)}</div>
        </div>
        <div className="text-right">
          <div className={cn("text-lg font-semibold tabular-nums", live && "text-amber-700 dark:text-amber-400")}>{formatDuration(secs)}</div>
          <div className="text-xs text-muted-foreground">{live ? STATUS_LABEL[call.status] ?? call.status : endedReasonLabel(call.endedReason) ?? STATUS_LABEL[call.status] ?? call.status}</div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Customer</dt>
        <dd className="min-w-0 truncate">
          {call.customerId ? (
            <Link href={`/customers/${call.customerId}`} className="inline-flex items-center gap-1 font-medium hover:underline">
              {call.customerName ?? call.customerId}
              <ArrowUpRight className="size-3 text-muted-foreground" />
            </Link>
          ) : (
            <span className="text-muted-foreground">Not identified</span>
          )}
          {call.customerKind ? <span className="ml-1.5 text-xs text-muted-foreground capitalize">{call.customerKind}</span> : null}
        </dd>
        <dt className="text-muted-foreground">Address</dt>
        <dd className="min-w-0 truncate">
          {call.addressId ? (
            <Link href={`/customers/${call.customerId}#${call.addressId}`} className="inline-flex items-center gap-1 hover:underline">
              {call.addressLabel ?? call.addressId}
              <ArrowUpRight className="size-3 text-muted-foreground" />
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Outcome</dt>
        <dd>
          {outcome ? (
            <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ring-1 ring-inset", outcomeTone(call.outcome))}>{outcome}</span>
          ) : (
            <span className="text-muted-foreground">{live ? "In progress" : "Pending analysis"}</span>
          )}
        </dd>
        {call.handoff ? (
          <>
            <dt className="text-muted-foreground">Handoff</dt>
            <dd className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <ArrowRightLeft className="size-3.5" />
              {call.handoffReason ?? "Transfer attempted"}
            </dd>
          </>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {call.needsReview ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-red-50 px-1.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="size-3" /> Needs review
          </span>
        ) : (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="size-3" /> Reviewed
          </span>
        )}
        {call.costCents != null ? <span className="text-xs text-muted-foreground">${(call.costCents / 100).toFixed(2)}</span> : null}
        {call.providerCallId ? (
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground" title={call.providerCallId}>
            {call.providerCallId.slice(0, 18)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const ACTION_ICON: Record<ActionKind, typeof CalendarPlus> = {
  booking: CalendarPlus,
  reschedule: CalendarPlus,
  cancellation: XCircle,
  note: StickyNote,
  task: ClipboardList,
  identified: UserCheck,
  transfer: ArrowRightLeft,
  phone: Phone,
  other: FileText,
};

const ACTION_TONE: Record<ActionKind, string> = {
  booking: "text-emerald-700 dark:text-emerald-300",
  reschedule: "text-blue-700 dark:text-blue-300",
  cancellation: "text-red-700 dark:text-red-300",
  note: "text-muted-foreground",
  task: "text-purple-700 dark:text-purple-300",
  identified: "text-muted-foreground",
  transfer: "text-amber-800 dark:text-amber-300",
  phone: "text-muted-foreground",
  other: "text-muted-foreground",
};

function Actions({ call }: { call: CallDetailData }) {
  return (
    <div>
      <SectionTitle aside={<span className="text-xs text-muted-foreground">{call.actions.length}</span>}>Actions taken</SectionTitle>
      {call.actions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Nothing was changed during this call.</p>
      ) : (
        <ol className="divide-y rounded-lg border bg-card">
          {call.actions.map((a) => {
            const Icon = ACTION_ICON[a.kind];
            const body = (
              <>
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", ACTION_TONE[a.kind])} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug">{a.label}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {a.agent ? <AgentBadge /> : <span>{a.actorLabel}</span>}
                    <span>{formatTimeET(a.ts)}</span>
                    {a.fixture ? <span className="rounded bg-muted px-1 font-mono">fixture</span> : null}
                  </div>
                </div>
                {a.href ? <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              </>
            );
            return (
              <li key={a.id}>
                {a.href ? (
                  <Link href={a.href} className="flex items-start gap-2 p-2.5 hover:bg-muted/60">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2 p-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {call.tasks.length ? (
        <ul className="mt-2 space-y-1">
          {call.tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-xs">
              <ClipboardList className="size-3 text-purple-700 dark:text-purple-300" />
              <Link href={`/inbox?task=${t.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {t.title}
              </Link>
              <span className={cn("rounded-full px-1.5 py-px text-xs font-medium", t.status === "open" ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" : "bg-muted text-muted-foreground")}>
                {t.kind} · {t.status.replace("_", " ")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Promises({ call, live }: { call: CallDetailData; live: boolean }) {
  const analyzed = Boolean(call.summary) || call.promises.length > 0;
  return (
    <div>
      <SectionTitle aside={<span className="text-xs text-muted-foreground">{call.promises.length || ""}</span>}>Promises made</SectionTitle>
      {call.promises.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {live ? "Analysis runs when the call ends." : analyzed ? "No promises were made on this call." : "Analysis pending."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {call.promises.map((p, i) => (
            <li key={i} className="flex items-start gap-2 p-2.5">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-teal-700 dark:text-teal-300" />
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug">{p.text}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {p.kind ? <span className="capitalize">{p.kind}</span> : null}
                  {p.dueAt ? <span>· due {formatDateTimeET(p.dueAt)}</span> : null}
                  {p.taskId ? (
                    <Link href={`/inbox?task=${p.taskId}`} className="hover:underline">
                      · task
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Summary({ call, live }: { call: CallDetailData; live: boolean }) {
  return (
    <div>
      <SectionTitle>Summary</SectionTitle>
      {call.summary ? (
        <p className="rounded-lg border bg-card p-3 text-sm leading-relaxed">{call.summary}</p>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{live ? "Written when the call ends." : "Analysis pending."}</p>
      )}
    </div>
  );
}
