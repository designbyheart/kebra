"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveCancellationAction, rejectCancellationAction } from "@/app/inbox/actions";
import { Button } from "@/components/atoms/ui/button";
import { Textarea } from "@/components/atoms/ui/textarea";

const APPROVE_LABEL = { pending: "Working…", idle: "Approve cancellation" } as const;
const REJECT_LABEL = { pending: "Saving…", idle: "Reject & create callback" } as const;

export type CancellationActionsProps = {
  changeRequestId: string;
  customerName: string;
  /** Rendered only for admins; the parent decides. */
  windowLabel?: string | null;
};

/**
 * Approve / reject island. Reject requires a note: it becomes the callback
 * task body and the `job.cancellation_rejected` event payload.
 */
export function CancellationActions({ changeRequestId, customerName, windowLabel }: CancellationActionsProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = (pending && "pending") || "idle";

  const approve = () => {
    const what = (windowLabel && `${customerName}'s visit (${windowLabel})`) || `${customerName}'s visit`;
    if (!window.confirm(`Cancel ${what}? The job moves to "user canceled".`)) return;
    setError(null);
    start(async () => {
      const r = await approveCancellationAction(changeRequestId);
      if (r.ok) {
        toast.success(`Cancellation approved for ${customerName}.`);
        router.refresh();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  };

  const reject = () => {
    const trimmed = note.trim();
    if (trimmed.length < 3) {
      setError("Add a short note for the callback (why the visit stays on the books).");
      return;
    }
    setError(null);
    start(async () => {
      const r = await rejectCancellationAction(changeRequestId, trimmed);
      if (r.ok) {
        toast.success(`Kept ${customerName}'s visit; callback task created.`);
        setMode("idle");
        setNote("");
        router.refresh();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  };

  if (mode === "reject") {
    return (
      <div className="flex w-full flex-col gap-2">
        <label htmlFor={`reject-note-${changeRequestId}`} className="text-sm font-medium text-muted-foreground">
          Note for the callback (required)
        </label>
        <Textarea
          id={`reject-note-${changeRequestId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Tech is already en route; offered to reschedule instead."
          className="min-h-20 bg-background"
          disabled={pending}
          autoFocus
          aria-invalid={Boolean(error) || undefined}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="destructive" onClick={reject} disabled={pending || note.trim().length < 3}>
            {REJECT_LABEL[busy]}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            disabled={pending}
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Button size="sm" onClick={approve} disabled={pending}>
        {APPROVE_LABEL[busy]}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setMode("reject")} disabled={pending}>
        Reject…
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
