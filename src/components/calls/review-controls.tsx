"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardPlus, Flag } from "lucide-react";
import type { CallDetail } from "@/app/calls/data";
import { createFollowUpTask, setCallReviewed } from "@/app/calls/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** "Create follow-up task" and "Mark reviewed" — server actions with the office actor. */
export function ReviewControls({ call, onChanged }: { call: CallDetail; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleReviewed = () => {
    const next = !call.needsReview;
    start(async () => {
      const res = await setCallReviewed(call.id, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(next ? "Flagged for review" : "Marked reviewed");
      onChanged();
    });
  };

  const submitTask = (form: FormData) => {
    setError(null);
    start(async () => {
      const res = await createFollowUpTask({
        callId: call.id,
        title: String(form.get("title") ?? ""),
        body: String(form.get("body") ?? ""),
        kind: (String(form.get("kind") ?? "followup") as "followup" | "callback" | "review" | "handoff"),
        dueAt: String(form.get("dueAt") ?? "") || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Task created", { description: "It is in the Inbox." });
      setOpen(false);
      onChanged();
    });
  };

  const defaultTitle = call.customerName ? `Follow up with ${call.customerName}` : "Follow up on call";

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="sm" variant="default" />}>
          <ClipboardPlus data-icon="inline-start" />
          Create follow-up task
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <form action={submitTask} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Follow-up task</DialogTitle>
              <DialogDescription>Goes to the Inbox, linked to this call{call.customerName ? ` and ${call.customerName}` : ""}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="fu-title">Title</Label>
              <Input id="fu-title" name="title" defaultValue={defaultTitle} required maxLength={200} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fu-body">Details</Label>
              <Textarea id="fu-body" name="body" rows={4} maxLength={2000} defaultValue={call.summary ?? ""} placeholder="What needs to happen, and what was promised." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fu-kind">Kind</Label>
                <select id="fu-kind" name="kind" defaultValue="followup" className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
                  <option value="followup">Follow-up</option>
                  <option value="callback">Callback</option>
                  <option value="review">Review</option>
                  <option value="handoff">Handoff</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-due">Due (optional)</Label>
                <Input id="fu-due" name="dueAt" type="datetime-local" className="text-sm" />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Creating…" : "Create task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Button size="sm" variant={call.needsReview ? "secondary" : "outline"} onClick={toggleReviewed} disabled={pending}>
        {call.needsReview ? <CheckCircle2 data-icon="inline-start" /> : <Flag data-icon="inline-start" />}
        {call.needsReview ? "Mark reviewed" : "Flag for review"}
      </Button>
    </div>
  );
}
