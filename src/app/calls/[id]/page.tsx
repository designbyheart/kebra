import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CallDetail } from "@/components/calls/call-detail";
import { requireUser } from "@/lib/auth";
import { formatDateTimeET } from "@/lib/time";
import { getCall } from "../data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const call = await getCall(id);
  return { title: call ? `Call · ${call.customerName ?? call.caller}` : "Call" };
}

export default async function CallPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const call = await getCall(id);
  if (!call) notFound();

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link href="/calls" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Calls
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="truncate font-semibold">
          {call.customerName ?? call.caller}
          <span className="ml-2 font-normal text-muted-foreground">{formatDateTimeET(call.startedAt)}</span>
        </h1>
      </div>
      <CallDetail initial={call} />
    </div>
  );
}
