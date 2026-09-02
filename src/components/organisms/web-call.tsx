import { DialFallback } from "@/components/molecules/dial-fallback";
import { WebCallPanel } from "./web-call-panel";

export type WebCallProps = { publicKey: string | null; assistantId: string | null; phoneE164: string; phoneLabel: string };

/** The public call page body: the web-call card followed by the dial-in fallback. */
export function WebCall({ publicKey, assistantId, phoneE164, phoneLabel }: WebCallProps) {
  return (
    <>
      <WebCallPanel publicKey={publicKey} assistantId={assistantId} />
      <DialFallback phoneE164={phoneE164} phoneLabel={phoneLabel} />
    </>
  );
}
