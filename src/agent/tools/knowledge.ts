// Owned by W1-C (see docs/briefs/W1-C-knowledge.md). The registry merges this map.
import type { ToolDef } from "@/agent/registry";
import { getAddressDossierTool } from "@/agent/tools/get-address-dossier";
import { getVisitHistoryTool } from "@/agent/tools/get-visit-history";
import { getJobNotesTool } from "@/agent/tools/get-job-notes";
import { getJobTool } from "@/agent/tools/get-job";
import { checkWarrantyTool } from "@/agent/tools/check-warranty";
import { getOpenBalanceTool } from "@/agent/tools/get-open-balance";
import { getScheduleTool } from "@/agent/tools/get-schedule";

export const tools: Record<string, ToolDef> = {
  get_address_dossier: getAddressDossierTool,
  get_visit_history: getVisitHistoryTool,
  get_job_notes: getJobNotesTool,
  get_job: getJobTool,
  check_warranty: checkWarrantyTool,
  get_open_balance: getOpenBalanceTool,
  get_schedule: getScheduleTool,
};
