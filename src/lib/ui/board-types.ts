/**
 * Shared shapes for the Today board. Server code (`src/app/today/data.ts`)
 * builds `BoardData`; the client board and `/api/board` consume it. Types
 * only — this file must stay importable from client components.
 */
import type { Schedule, ScheduleJob } from "@/domain/schedule";
import type { Job } from "@/db/schema";

export type WorkStatus = Job["workStatus"];
export type JobPriority = Job["priority"];
export type JobSource = Job["source"];

export type BoardJob = ScheduleJob;

/** A job with no arrival window yet ("needs scheduling" lane). */
export type UnscheduledJob = {
  job_id: string;
  invoice_number: string | null;
  description: string | null;
  status: WorkStatus;
  priority: JobPriority;
  source: JobSource;
  customer_name: string;
  address_label: string | null;
  tech_names: string[];
  tech_ids: string[];
  updated_at: string;
};

export type BoardTech = { id: string; name: string };

export type BoardData = {
  date: string;
  /** `getSchedule(date)` — live (non-canceled) jobs, per-tech day, summary, speech hint. */
  schedule: Schedule;
  /** Canceled jobs that were on this day; shown gray so a cancellation is visible, not a disappearance. */
  canceled: BoardJob[];
  /** Backlog without a window (newest first, capped) and the full count. */
  needsScheduling: { jobs: UnscheduledJob[]; total: number };
  /** Every active field tech, for the reassign / reschedule pickers. */
  techs: BoardTech[];
  /** Server clock at build time (ISO). */
  now: string;
};

// --- side sheet -------------------------------------------------------------

export type JobNote = {
  id: string;
  content: string;
  authorType: "tech" | "office" | "agent" | "system";
  authorId: string | null;
  createdAt: string;
  seq: number;
};

export type PendingCancellation = {
  id: string;
  reason: string | null;
  requestedAt: string;
  callId: string | null;
  taskId: string | null;
};

export type JobSheetData = {
  job: {
    id: string;
    invoiceNumber: string | null;
    description: string | null;
    workStatus: WorkStatus;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    arrivalWindow: number | null;
    customerId: string;
    customerName: string;
    addressId: string | null;
    addressLabel: string | null;
    serviceType: string | null;
    priority: JobPriority;
    source: JobSource;
    tags: string[];
    totalAmount: number;
    outstandingBalance: number;
    createdAt: string;
    techs: { id: string; name: string; role: string }[];
  };
  notes: JobNote[];
  pendingCancellation: PendingCancellation | null;
  serviceTypes: { id: string; name: string; durationMinutes: number }[];
};

export type Slot = {
  window_start: string;
  window_end: string;
  window_label: string;
  employee_id: string;
  employee_name: string;
  reason: "last_tech_here" | "least_loaded" | "only_available";
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Run a sheet write: toast on the result, reload the sheet, tell the board. */
export type Run = (label: string, fn: () => Promise<ActionResult<unknown>>, after?: () => void) => void;

// --- client board state -----------------------------------------------------

/** Why a card is highlighted after a live refresh. */
export type Flash = "new" | "changed";

/** Refetch state of the client board against /api/board. */
export type FetchState = "idle" | "refreshing" | "error" | "signed-out";
