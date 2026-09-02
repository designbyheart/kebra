/**
 * Client-safe job constants. Mirrors the `work_status` / `job_source` /
 * `job_priority` pg enums in src/db/schema.ts without importing drizzle or
 * the postgres driver, so "use client" components can use them. Keep in sync
 * with the schema (src/domain/jobs.ts re-derives WORK_STATUSES from the enum;
 * a test there guards the two lists agree).
 */
export const WORK_STATUSES = [
  "scheduled",
  "in progress",
  "complete rated",
  "complete unrated",
  "needs scheduling",
  "user canceled",
  "pro canceled",
  "pending_cancellation",
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const JOB_SOURCES = ["import", "agent", "office"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const JOB_PRIORITIES = ["normal", "high", "emergency"] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export const SERVICE_TYPE_IDS = ["diagnostic", "repair", "maintenance", "install", "callback", "estimate"] as const;
export type ServiceTypeId = (typeof SERVICE_TYPE_IDS)[number];

/** Statuses the office (and the agent) may still move or cancel. */
export const OPEN_FOR_CHANGE: readonly WorkStatus[] = ["scheduled", "needs scheduling"];
export const TERMINAL_STATUSES: readonly WorkStatus[] = ["complete rated", "complete unrated", "user canceled", "pro canceled"];
