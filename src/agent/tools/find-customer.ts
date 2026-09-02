import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { db } from "@/db";
import { customerPhones, customers } from "@/db/schema";
import { emitEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { CONFIDENT, findCustomer } from "@/domain/search";

export const E164 = /^\+[1-9]\d{6,14}$/;
const e164 = z
  .string()
  .trim()
  .regex(E164, "phone must be E.164, e.g. +13055551234")
  .describe("E.164 phone number, e.g. +13055551234");

/** "+13055551234" -> "+1 (305) •••-1234"; other countries keep code + last 4. */
export function maskPhone(phone: string): string {
  const m = /^\+1(\d{3})\d{3}(\d{4})$/.exec(phone);
  if (m) return `+1 (${m[1]}) •••-${m[2]}`;
  const digits = phone.replace(/\D/g, "");
  return `+${digits.slice(0, 2)} ••• ${digits.slice(-4)}`;
}

function joinSpoken(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export const findCustomerTool = defineTool({
  description:
    "Look up a customer by name, company, or phone number. Phone matches exactly (E.164); names and companies " +
    "match fuzzily, so a partial or misheard name still works. Returns up to 5 candidates with confidence; " +
    "confirm the top candidate with the caller when there is more than one plausible match.",
  input: z
    .object({
      name: z.string().trim().max(120).optional().describe("Caller's name as spoken, e.g. 'Teresa Rush'"),
      company: z.string().trim().max(120).optional().describe("Company or property manager, e.g. 'Starfish Hospitality'"),
      phone: e164.optional(),
    })
    .refine((v) => Boolean(v.name || v.company || v.phone), { message: "provide name, company or phone" }),
  handler: async (input) => {
    const candidates = await findCustomer({ name: input.name, company: input.company, phone: input.phone });
    if (candidates.length === 0) {
      throw new ToolError(
        "not_found",
        "no customer matched",
        input.phone && !input.name && !input.company
          ? "I don't have that number on file yet. Could I get your name, or the service address?"
          : "I couldn't find that name. Could you spell the last name, or give me the service address?",
        { candidates: [] },
      );
    }
    const top = candidates[0];
    const second = candidates[1];
    let speech_hint: string;
    if (top.matched_by === "phone" && (!second || second.matched_by !== "phone")) {
      speech_hint = `I have this number under ${top.display_name}. Is that you?`;
    } else if (top.confidence >= CONFIDENT && (!second || second.confidence <= top.confidence - 0.15)) {
      speech_hint = `I have ${top.display_name}. Is that right?`;
    } else {
      speech_hint = `I found a few: ${joinSpoken(candidates.slice(0, 3).map((c) => c.display_name))}. Which one is it?`;
    }
    return {
      candidates: candidates.map((c) => ({
        customer_id: c.customer_id,
        display_name: c.display_name,
        kind: c.kind,
        company: c.company,
        sites_count: c.sites_count,
        last_job_at: c.last_job_at,
        label: c.label,
        confidence: c.confidence,
        matched_by: c.matched_by,
      })),
      speech_hint,
    };
  },
});

export const saveCallerPhoneTool = defineTool({
  description:
    "Save the caller's phone number on a customer record so future calls are recognized automatically. " +
    "Call it once the customer has been identified and confirmed. Safe to repeat.",
  input: z.object({
    customer_id: z.string().trim().min(1).max(64),
    phone: e164,
    label: z.enum(["mobile", "office", "other"]).optional(),
  }),
  handler: async (input, ctx) => {
    const [cust] = await db
      .select({ id: customers.id, displayName: customers.displayName })
      .from(customers)
      .where(sql`${customers.id} = ${input.customer_id}`)
      .limit(1);
    if (!cust) {
      throw new ToolError(
        "not_found",
        `customer ${input.customer_id} not found`,
        "I couldn't find that customer record. Let me look you up another way.",
      );
    }
    const source = ctx.actor === "office" ? "office" : "agent";
    const [row] = await db
      .insert(customerPhones)
      .values({
        id: newId("phn"),
        customerId: cust.id,
        phone: input.phone,
        label: input.label ?? null,
        source,
      })
      .onConflictDoUpdate({
        target: [customerPhones.customerId, customerPhones.phone],
        set: {
          lastSeenAt: sql`now()`,
          label: sql`coalesce(excluded.label, ${customerPhones.label})`,
        },
      })
      .returning({ id: customerPhones.id, label: customerPhones.label });

    const phoneMasked = maskPhone(input.phone);
    await emitEvent({
      actor: ctx.actor,
      actorId: ctx.actorId ?? (ctx.actor === "agent" ? "vapi" : null),
      callId: ctx.callId,
      type: "customer.phone_added",
      entityType: "customer",
      entityId: cust.id,
      payload: {
        actor_label: ctx.actor === "agent" ? "Agent" : "Office",
        summary: `Saved ${phoneMasked} for ${cust.displayName}.`,
        customer_id: cust.id,
        phone_masked: phoneMasked,
        label: row?.label ?? input.label ?? null,
      },
    });

    return {
      saved: true as const,
      customer_id: cust.id,
      phone_id: row?.id ?? null,
      phone_masked: phoneMasked,
      speech_hint: "Got it, I've saved this number to your account.",
    };
  },
});
