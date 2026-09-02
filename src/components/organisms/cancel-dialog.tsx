"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { cancelJobAction } from "@/app/jobs/actions";
import { FormField } from "@/components/atoms/form-field";
import { RadioLabel } from "@/components/atoms/radio-label";
import { Button } from "@/components/atoms/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/atoms/ui/dialog";
import { Textarea } from "@/components/atoms/ui/textarea";

type Target = "user canceled" | "pro canceled";

const CONFIRM_LABEL = { pending: "Canceling…", idle: "Confirm cancellation" } as const;

export type CancelDialogProps = { jobId: string; hasPendingRequest: boolean };

/** Office-side cancellation: who canceled + a required reason. */
export function CancelDialog({ jobId, hasPendingRequest }: CancelDialogProps) {
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
            {hasPendingRequest && " The pending cancellation request will be closed as approved."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-4 text-sm">
          <RadioLabel name="target" checked={target === "user canceled"} onChange={() => setTarget("user canceled")}>
            Customer canceled
          </RadioLabel>
          <RadioLabel name="target" checked={target === "pro canceled"} onChange={() => setTarget("pro canceled")}>
            We canceled
          </RadioLabel>
        </div>
        <FormField variant="plain" label="Reason (required)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this visit being canceled?" />
        </FormField>
        <DialogFooter showCloseButton>
          <Button type="button" size="sm" variant="destructive" onClick={submit} disabled={!reason.trim() || pending}>
            {CONFIRM_LABEL[(pending && "pending") || "idle"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
