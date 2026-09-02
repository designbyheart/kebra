import { Badge } from "@/components/atoms/ui/badge";

export type ResolvedBadgeProps = { status: "approved" | "rejected" };

/** Outcome of a resolved cancellation request. */
export function ResolvedBadge({ status }: ResolvedBadgeProps) {
  if (status === "approved") {
    return (
      <Badge variant="secondary" className="bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        Canceled
      </Badge>
    );
  }
  return <Badge variant="outline">Kept on the books</Badge>;
}
