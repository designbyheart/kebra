import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatDateTimeET } from "@/lib/time";

export type CallPageHeadingProps = {
  /** Customer name, or the masked caller when unidentified. */
  name: string;
  startedAt: string;
};

/** "‹ Calls / Name  date" crumb row at the top of a call page. */
export function CallPageHeading({ name, startedAt }: CallPageHeadingProps) {
  return (
    <div className="mb-4 flex items-center gap-3 text-sm">
      <Link href="/calls" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Calls
      </Link>
      <span className="text-muted-foreground">/</span>
      <h1 className="truncate text-xl font-semibold">
        {name}
        <span className="ml-2 font-normal text-muted-foreground">{formatDateTimeET(startedAt)}</span>
      </h1>
    </div>
  );
}
