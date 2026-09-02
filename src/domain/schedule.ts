/**
 * The day board (W1-C `get_schedule`): jobs on an ET calendar day, per-tech
 * load with free gaps, and an owner-style one-sentence summary.
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { addresses, businessHours, customers, jobs, type Job } from "@/db/schema";
import { fromET } from "@/lib/time";
import {
  addressLabel,
  capitalize,
  firstName,
  hasCallbackTag,
  isCanceled,
  joinSpoken,
  loadTechs,
  numberWord,
  spokenDay,
  spokenTime,
  spokenWindow,
  windowEnd,
  type TechRef,
} from "@/domain/history";
import { INSTALL_RE } from "@/domain/warranty";

export type ScheduleJob = {
  job_id: string;
  invoice_number: string | null;
  window_start: string;
  window_end: string | null;
  window_label: string;
  status: Job["workStatus"];
  priority: Job["priority"];
  description: string | null;
  customer_name: string;
  address_id: string | null;
  address_label: string | null;
  tech_names: string[];
  tech_ids: string[];
  tags: string[];
  source: Job["source"];
  is_install: boolean;
  is_callback: boolean;
};

export type TechDay = {
  employee_id: string;
  name: string;
  job_count: number;
  first_start: string | null;
  last_end: string | null;
  gaps: { start: string; end: string; label: string }[];
};

export type ScheduleSummary = {
  total: number;
  by_status: Record<string, number>;
  techs_working: number;
  first_start: string | null;
  last_end: string | null;
  unassigned: number;
  needs_scheduling: number;
  in_progress: number;
  pending_cancellation: number;
  canceled: number;
  installs: number;
  callbacks: number;
};

export type Schedule = {
  date: string;
  summary: ScheduleSummary;
  jobs: ScheduleJob[];
  techs: TechDay[];
  employee_id: string | null;
  speech_hint: string;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_GAP_MS = 30 * 60_000;
const MIN_EDGE_GAP_MS = 60 * 60_000;

export function parseDateET(date: string): { start: Date; end: Date; dow: number } | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const wall = new Date(y, mo - 1, d, 0, 0, 0, 0);
  if (wall.getFullYear() !== y || wall.getMonth() !== mo - 1 || wall.getDate() !== d) return null;
  return { start: fromET(wall), end: fromET(new Date(y, mo - 1, d + 1, 0, 0, 0, 0)), dow: wall.getDay() };
}

function hoursOn(date: string, hhmm: string | null): Date | null {
  if (!hhmm) return null;
  const m = DATE_RE.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m || !t) return null;
  return fromET(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]), 0, 0));
}

type Block = { start: Date; end: Date };

function mergeBlocks(blocks: Block[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Block[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.start.getTime() <= last.end.getTime()) {
      if (b.end.getTime() > last.end.getTime()) last.end = b.end;
    } else out.push({ start: b.start, end: b.end });
  }
  return out;
}

export function computeGaps(blocks: Block[], open: Date | null, close: Date | null): TechDay["gaps"] {
  const merged = mergeBlocks(blocks);
  const gaps: Block[] = [];
  if (merged.length === 0) {
    if (open && close) gaps.push({ start: open, end: close });
  } else {
    if (open && merged[0].start.getTime() - open.getTime() >= MIN_EDGE_GAP_MS) gaps.push({ start: open, end: merged[0].start });
    for (let i = 1; i < merged.length; i++) {
      if (merged[i].start.getTime() - merged[i - 1].end.getTime() >= MIN_GAP_MS) gaps.push({ start: merged[i - 1].end, end: merged[i].start });
    }
    const lastEnd = merged[merged.length - 1].end;
    if (close && close.getTime() - lastEnd.getTime() >= MIN_EDGE_GAP_MS) gaps.push({ start: lastEnd, end: close });
  }
  return gaps.map((g) => ({
    start: g.start.toISOString(),
    end: g.end.toISOString(),
    label: `${spokenTime(g.start)} to ${spokenTime(g.end)}`,
  }));
}

export async function getSchedule(date: string, employeeId?: string | null, now: Date = new Date()): Promise<Schedule | null> {
  const day = parseDateET(date);
  if (!day) return null;

  const [rows, hours] = await Promise.all([
    db
      .select({ job: jobs, customerName: customers.displayName, address: addresses })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .leftJoin(addresses, eq(addresses.id, jobs.addressId))
      .where(and(gte(jobs.scheduledStart, day.start), lt(jobs.scheduledStart, day.end)))
      .orderBy(jobs.scheduledStart, jobs.id),
    db.select().from(businessHours).where(eq(businessHours.dow, day.dow)).limit(1),
  ]);
  const techMap = await loadTechs(rows.map((r) => r.job.id));

  const canceledCount = rows.filter((r) => isCanceled(r.job.workStatus)).length;
  let live = rows.filter((r) => !isCanceled(r.job.workStatus));
  if (employeeId) live = live.filter((r) => (techMap.get(r.job.id) ?? []).some((t) => t.employee_id === employeeId));

  const list: ScheduleJob[] = live.map((r) => {
    const techs = techMap.get(r.job.id) ?? [];
    const start = r.job.scheduledStart!;
    const wEnd = windowEnd(r.job);
    return {
      job_id: r.job.id,
      invoice_number: r.job.invoiceNumber,
      window_start: start.toISOString(),
      window_end: wEnd ? wEnd.toISOString() : null,
      window_label: spokenWindow(start, wEnd, now),
      status: r.job.workStatus,
      priority: r.job.priority,
      description: r.job.description,
      customer_name: r.customerName,
      address_id: r.address?.id ?? null,
      address_label: r.address ? addressLabel(r.address) : null,
      tech_names: techs.map((t) => t.name),
      tech_ids: techs.map((t) => t.employee_id),
      tags: r.job.tags,
      source: r.job.source,
      is_install: Boolean(r.job.description && INSTALL_RE.test(r.job.description)),
      is_callback: hasCallbackTag(r.job.tags) || /callback/i.test(r.job.description ?? ""),
    };
  });

  // Per-tech day
  const open = hours[0] && !hours[0].closed ? hoursOn(date, hours[0].open) : null;
  const close = hours[0] && !hours[0].closed ? hoursOn(date, hours[0].close) : null;
  const perTech = new Map<string, { ref: TechRef; blocks: Block[]; count: number }>();
  for (const r of live) {
    const start = r.job.scheduledStart!;
    const end = r.job.scheduledEnd && r.job.scheduledEnd > start ? r.job.scheduledEnd : (windowEnd(r.job) ?? start);
    for (const t of techMap.get(r.job.id) ?? []) {
      const e = perTech.get(t.employee_id) ?? { ref: t, blocks: [], count: 0 };
      e.blocks.push({ start, end });
      e.count++;
      perTech.set(t.employee_id, e);
    }
  }
  const techs: TechDay[] = [...perTech.values()]
    .filter((t) => !employeeId || t.ref.employee_id === employeeId)
    .map((t) => {
      const merged = mergeBlocks(t.blocks);
      return {
        employee_id: t.ref.employee_id,
        name: t.ref.name,
        job_count: t.count,
        first_start: merged[0]?.start.toISOString() ?? null,
        last_end: merged[merged.length - 1]?.end.toISOString() ?? null,
        gaps: computeGaps(t.blocks, open, close),
      };
    })
    .sort((a, b) => b.job_count - a.job_count || a.name.localeCompare(b.name));

  const by_status: Record<string, number> = {};
  for (const j of list) by_status[j.status] = (by_status[j.status] ?? 0) + 1;
  const starts = list.map((j) => j.window_start).sort();
  const ends = live
    .map((r) => (r.job.scheduledEnd ?? windowEnd(r.job))?.toISOString())
    .filter((s): s is string => Boolean(s))
    .sort();

  const summary: ScheduleSummary = {
    total: list.length,
    by_status,
    techs_working: techs.length,
    first_start: starts[0] ?? null,
    last_end: ends[ends.length - 1] ?? null,
    unassigned: list.filter((j) => j.tech_ids.length === 0).length,
    needs_scheduling: by_status["needs scheduling"] ?? 0,
    in_progress: by_status["in progress"] ?? 0,
    pending_cancellation: by_status["pending_cancellation"] ?? 0,
    canceled: canceledCount,
    installs: list.filter((j) => j.is_install).length,
    callbacks: list.filter((j) => j.is_callback).length,
  };

  return {
    date,
    summary,
    jobs: list,
    techs,
    employee_id: employeeId ?? null,
    speech_hint: scheduleSpeech(date, summary, techs, employeeId ?? null, now),
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${numberWord(n)} ${n === 1 ? one : many}`;
}

/** "Ten jobs today across six techs, one install, two callbacks, one still unassigned." */
export function scheduleSpeech(date: string, s: ScheduleSummary, techs: TechDay[], employeeId: string | null, now: Date): string {
  const day = spokenDay(`${date}T12:00:00-04:00`, now).replace(/^(?!today|tomorrow|yesterday)/, "on ");
  if (employeeId) {
    const t = techs.find((x) => x.employee_id === employeeId);
    if (!t || t.job_count === 0) return `Nothing on the board ${day} for that tech.`;
    const name = firstName(t.name);
    const bits = [`${name} has ${plural(t.job_count, "job")} ${day}`];
    if (t.first_start) bits.push(`first at ${spokenTime(t.first_start)}`);
    if (t.last_end) bits.push(`wrapping up by ${spokenTime(t.last_end)}`);
    const gap = [...t.gaps].sort((a, b) => new Date(b.end).getTime() - new Date(b.start).getTime() - (new Date(a.end).getTime() - new Date(a.start).getTime()))[0];
    const tail = gap ? `, with a free block from ${gap.label}.` : ".";
    return `${bits.join(", ")}${tail}`;
  }
  if (s.total === 0) return `Nothing on the board ${day}${s.canceled ? `, ${plural(s.canceled, "cancellation")} only` : ""}.`;
  const extras: string[] = [];
  if (s.installs) extras.push(plural(s.installs, "install"));
  if (s.callbacks) extras.push(plural(s.callbacks, "callback"));
  if (s.in_progress) extras.push(`${numberWord(s.in_progress)} in progress`);
  if (s.pending_cancellation) extras.push(`${numberWord(s.pending_cancellation)} pending cancellation`);
  if (s.unassigned) extras.push(`${numberWord(s.unassigned)} still unassigned`);
  const head = `${capitalize(plural(s.total, "job"))} ${day} across ${plural(s.techs_working, "tech")}`;
  return `${head}${extras.length ? `, ${joinSpoken(extras)}` : ""}.`;
}
