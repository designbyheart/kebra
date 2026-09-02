import { Phone } from "lucide-react";
import { AgentPhoneTag } from "@/components/atoms/agent-phone-tag";
import { formatPhoneLocal } from "@/lib/ui/format";

export type CustomerPhoneLinkProps = {
  phone: { phone: string; label: string | null; source: string };
};

/** tel: link with the local number and an Agent mark when the agent captured it. */
export function CustomerPhoneLink({ phone: p }: CustomerPhoneLinkProps) {
  return (
    <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 tabular-nums hover:underline" title={`${p.label ?? "phone"} · ${p.source}`}>
      <Phone className="size-3" />
      {formatPhoneLocal(p.phone)}
      {p.source === "agent" && <AgentPhoneTag />}
    </a>
  );
}
