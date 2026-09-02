import type { Metadata } from "next";
import { CallClient } from "./call-client";

export const metadata: Metadata = { title: "Call Gulf Breeze Air" };
export const dynamic = "force-dynamic";

/** `+19346478409` → `+1 (934) 647-8409` */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return e164;
}

/**
 * Public web-call page. Same Vapi assistant as the phone line, so web calls
 * land on the platform identically (direction "web"). Read at request time so
 * VAPI_ASSISTANT_ID does not have to be known at build.
 */
export default function CallPage() {
  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? process.env.VAPI_PUBLIC_KEY ?? null;
  const assistantId = process.env.VAPI_ASSISTANT_ID ?? process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? null;
  const phone = process.env.VAPI_PHONE_NUMBER ?? "+19346478409";
  return <CallClient publicKey={publicKey} assistantId={assistantId} phoneE164={phone} phoneLabel={formatPhone(phone)} />;
}
