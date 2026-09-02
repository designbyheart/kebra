/**
 * Notes (W1-B). Contract: docs/TOOLS.md `add_note`; event `note.added`.
 */
import { desc, eq, sql } from "drizzle-orm";
import { jobs } from "@/db/schema";
import { ToolError } from "@/agent/errors";
import { appendNote, requireJob } from "./jobs";
import { actorId, actorLabelFor, resolveCallId, runWrite, type WriteActor } from "./idempotency";

export type AddNoteInput = {
  job_id?: string;
  address_id?: string;
  content: string;
  idempotency_key?: string;
};

export type AddNoteResult = {
  note_id: string;
  job_id: string;
  seq: number;
  speech_hint: string;
  [k: string]: unknown;
};

/** Phone numbers and door/gate codes never reach the event feed in clear. */
export function redactPreview(text: string, max = 120): string {
  const redacted = text
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[phone]")
    .replace(/\b(gate|door|lock ?box|lockbox|alarm|pin|access|entry|garage)\b([^\n\d]{0,20})(#?\s*\d[\d\s#*-]{2,})/gi, "$1$2[code]")
    .replace(/\bcode\b([^\n\d]{0,12})(#?\s*\d[\d\s#*-]{2,})/gi, "code$1[code]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > max ? `${redacted.slice(0, max - 1).trimEnd()}…` : redacted;
}

export async function addNote(input: AddNoteInput, who: WriteActor): Promise<AddNoteResult> {
  if (!input.job_id && !input.address_id) {
    throw new ToolError("validation", "job_id or address_id is required", "Which visit or address should I attach that note to?");
  }
  return runWrite<AddNoteResult>({
    tool: "add_note",
    idempotencyKey: input.idempotency_key,
    execute: async (tx) => {
      let jobId = input.job_id ?? null;
      let content = input.content.trim();
      let addressId = input.address_id ?? null;
      if (!jobId && addressId) {
        const [latest] = await tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(eq(jobs.addressId, addressId))
          .orderBy(desc(sql`coalesce(${jobs.scheduledStart}, ${jobs.createdAt})`))
          .limit(1);
        if (!latest) {
          throw new ToolError(
            "not_found",
            `no jobs at address ${addressId}`,
            "I don't have any visits on file at that address to attach a note to. Should I book one first?",
          );
        }
        jobId = latest.id;
        if (!/^\[address note\]/i.test(content)) content = `[address note] ${content}`;
      }
      const job = await requireJob(tx, jobId as string);
      addressId = addressId ?? job.addressId;
      const note = await appendNote(tx, { jobId: job.id, content, authorType: who.actor, authorId: actorId(who) });
      const preview = redactPreview(content);
      return {
        result: {
          note_id: note.id,
          job_id: job.id,
          seq: note.seq,
          speech_hint: "Got it, I've added that to the notes.",
        },
        event: {
          actor: who.actor,
          actorId: actorId(who),
          callId: await resolveCallId(tx, who.callId),
          type: "note.added",
          entityType: "note",
          entityId: note.id,
          payload: {
            actor_label: await actorLabelFor(tx, who),
            summary: `Added a note to ${job.customerName}'s visit${job.invoiceNumber ? ` #${job.invoiceNumber}` : ""}: ${preview}`,
            note_id: note.id,
            job_id: job.id,
            address_id: addressId,
            preview,
          },
        },
      };
    },
  });
}
