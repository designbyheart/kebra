"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addNoteAction } from "@/app/jobs/actions";
import { Button } from "@/components/atoms/ui/button";
import { Textarea } from "@/components/atoms/ui/textarea";

const SUBMIT_LABEL = { pending: "Saving…", idle: "Add note" } as const;

export type AddNoteFormProps = { jobId: string };

/** Textarea + submit that appends a note to the job and refreshes the page. */
export function AddNoteForm({ jobId }: AddNoteFormProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const content = ref.current?.value ?? "";
        if (!content.trim()) return;
        start(async () => {
          const res = await addNoteAction(jobId, content);
          if (res.ok) {
            toast.success("Note added");
            if (ref.current) ref.current.value = "";
            router.refresh();
          } else toast.error(res.message);
        });
      }}
    >
      <Textarea ref={ref} name="content" placeholder="Add a note for the tech or the office…" rows={3} disabled={pending} className="min-h-20" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Codes and phone numbers are masked for readers by default.</span>
        <Button type="submit" size="sm" disabled={pending}>
          {SUBMIT_LABEL[(pending && "pending") || "idle"]}
        </Button>
      </div>
    </form>
  );
}
