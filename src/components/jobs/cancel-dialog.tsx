"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { cancelJobAction } from "@/app/jobs/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Target = "user canceled" | "pro canceled";

export function CancelDialog({ jobId, hasPendingRequest }: { jobId: string; hasPendingRequest: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<Target>("user canceled");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await cancelJobAction(jobId, reason, target);
      if (res.ok) {
        toast.success("Job canceled");
        setOpen(false);
        setReason("");
        router.refresh();
      } else toast.error(res.message);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Ban data-icon="inline-start" />
        Cancel job
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this job</DialogTitle>
          <DialogDescription>
            Office cancellations take effect immediately and are logged under your name.
            {hasPendingRequest ? " The pending cancellation request will be closed as approved." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="target" checked={target === "user canceled"} onChange={() => setTarget("user canceled")} className="accent-foreground" />
            Customer canceled
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="target" checked={target === "pro canceled"} onChange={() => setTarget("pro canceled")} className="accent-foreground" />
            We canceled
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Reason (required)
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this visit being canceled?" />
        </label>
        <DialogFooter showCloseButton>
          <Button type="button" size="sm" variant="destructive" onClick={submit} disabled={!reason.trim() || pending}>
            {pending ? "Canceling…" : "Confirm cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
