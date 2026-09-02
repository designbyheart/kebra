"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveEvents, type LiveEvent } from "@/lib/use-live-events";

export type EntityLiveRefreshProps = { customerId?: string; addressId?: string; jobIds?: string[] };

/** The job an event is about: payload.job_id, else the entity when it is a job. */
function eventJobId(e: LiveEvent): string | null {
  const p = e.payload ?? {};
  if (typeof p.job_id === "string") return p.job_id;
  if (e.entityType === "job") return e.entityId;
  return null;
}

/**
 * Re-renders a customer / address page when something lands for it: any
 * event whose payload names this customer or address, or a `job.*` /
 * `note.added` event on one of the jobs shown. Debounced to one refresh per
 * burst.
 */
export function EntityLiveRefresh({ customerId, addressId, jobIds = [] }: EntityLiveRefreshProps) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobs = new Set(jobIds);

  const matches = (e: LiveEvent) => {
    const p = e.payload ?? {};
    if (addressId && p.address_id === addressId) return true;
    if (customerId && p.customer_id === customerId) return true;
    if (e.type.startsWith("job.") || e.type === "note.added" || e.type.startsWith("task.")) {
      const jid = eventJobId(e);
      return jid !== null && jobs.has(jid);
    }
    if (e.type === "customer.phone_added" && customerId) return e.entityId === customerId;
    return false;
  };

  useLiveEvents({
    filter: matches,
    max: 1,
    onEvent: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    },
  });

  return null;
}
