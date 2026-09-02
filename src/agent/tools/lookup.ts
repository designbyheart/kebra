// Owned by W1-A (see docs/briefs/W1-A-import.md). The registry merges this map.
import type { ToolDef } from "@/agent/registry";
import { findAddressTool } from "@/agent/tools/find-address";
import { findCustomerTool, saveCallerPhoneTool } from "@/agent/tools/find-customer";

export const tools: Record<string, ToolDef> = {
  find_address: findAddressTool,
  find_customer: findCustomerTool,
  save_caller_phone: saveCallerPhoneTool,
};
