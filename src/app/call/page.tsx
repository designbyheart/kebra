import type { Metadata } from "next";
import { WebCall } from "@/components/organisms/web-call";
import { OverlayPage } from "@/components/templates/overlay-page";
import { formatPhoneIntl } from "@/lib/ui/format";

export const metadata: Metadata = { title: "Call Gulf Breeze Air" };
export const dynamic = "force-dynamic";

/**
 * Public web-call page. Same Vapi assistant as the phone line, so web calls
 * land on the platform identically (direction "web"). Read at request time so
 * VAPI_ASSISTANT_ID does not have to be known at build.
 */
export default function CallPage() {
  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? process.env.VAPI_PUBLIC_KEY ?? null;
  const assistantId = process.env.VAPI_ASSISTANT_ID ?? process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? null;
  const phone = process.env.VAPI_PHONE_NUMBER ?? "+19346478409";
  return (
    // Covers the app shell (sidebar) rendered by the root layout; this page is public.
    <OverlayPage width="md" scrollable eyebrow="Gulf Breeze Air" title="Talk to the front desk" description="Brianna can look up your service history, check warranty, and book or move a visit.">
      <WebCall publicKey={publicKey} assistantId={assistantId} phoneE164={phone} phoneLabel={formatPhoneIntl(phone)} />
    </OverlayPage>
  );
}
