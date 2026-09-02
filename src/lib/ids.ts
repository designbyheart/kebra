import { randomUUID } from "node:crypto";

/**
 * Platform-created rows get `prefix_<22 hex chars>` ids, mirroring the
 * source data's `job_...`, `cus_...` style. Imported rows keep their ids.
 */
export function newId(prefix: string): string {
  const raw = randomUUID().replace(/-/g, "");
  return `${prefix}_${raw.slice(0, 22)}`;
}
