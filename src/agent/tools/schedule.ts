// Owned by W1-B (see docs/briefs/W1-B-scheduling.md). The registry merges this map.
import type { ToolDef } from "@/agent/registry";
import { findAvailabilityTool } from "@/agent/tools/find-availability";
import { findRescheduleSlotsTool } from "@/agent/tools/find-reschedule-slots";
import { bookJobTool } from "@/agent/tools/book-job";
import { rescheduleJobTool } from "@/agent/tools/reschedule-job";
import { requestCancellationTool } from "@/agent/tools/request-cancellation";
import { addNoteTool } from "@/agent/tools/add-note";
import { createTaskTool } from "@/agent/tools/create-task";

export const tools: Record<string, ToolDef> = {
  find_availability: findAvailabilityTool,
  find_reschedule_slots: findRescheduleSlotsTool,
  book_job: bookJobTool,
  reschedule_job: rescheduleJobTool,
  request_cancellation: requestCancellationTool,
  add_note: addNoteTool,
  create_task: createTaskTool,
};
