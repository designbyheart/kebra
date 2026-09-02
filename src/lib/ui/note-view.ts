import type { Note } from "@/db/schema";
import { AGENT_PILL, NEUTRAL_PILL } from "./job-status";

/** The note fields the office UI renders (plus an optional resolved author name). */
export type NoteView = Pick<Note, "id" | "content" | "authorType" | "createdAt" | "seq"> & { authorName?: string | null };

export const AUTHOR_LABEL: Record<Note["authorType"], string> = {
  tech: "Tech",
  office: "Office",
  agent: "Agent",
  system: "System",
};

export const AUTHOR_CLASS: Record<Note["authorType"], string> = {
  tech: NEUTRAL_PILL,
  office: "bg-muted text-foreground ring-border",
  agent: AGENT_PILL,
  system: `${NEUTRAL_PILL} border-dashed`,
};
