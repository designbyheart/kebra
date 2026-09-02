import { notFound } from "next/navigation";
import { CallPageHeading } from "@/components/organisms/call-page-heading";
import { CallDetail } from "@/components/organisms/call-detail";
import { DetailPage } from "@/components/templates/detail-page";
import { requireUser } from "@/lib/auth";
import { getCall } from "../data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const call = await getCall(id);
  if (!call) return { title: "Call" };
  return { title: `Call · ${call.customerName ?? call.caller}` };
}

export default async function CallPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const call = await getCall(id);
  if (!call) notFound();

  return (
    <DetailPage header={<CallPageHeading name={call.customerName ?? call.caller} startedAt={call.startedAt} />}>
      <CallDetail initial={call} />
    </DetailPage>
  );
}
