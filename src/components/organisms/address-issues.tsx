import Link from "next/link";
import { AlertTriangle, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import type { OpenIssue } from "@/domain/dossier-fallback";

export type AddressIssuesProps = { openIssues: OpenIssue[]; recurring: string[] };

/** Open issues + recurring work, side by side; nothing when both are empty. */
export function AddressIssues({ openIssues, recurring }: AddressIssuesProps) {
  if (openIssues.length === 0 && recurring.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card size="sm">
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-amber-600" />
            Open issues
          </CardTitle>
        </CardHeader>
        <CardContent>
          {openIssues.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting on us.</p>}
          {openIssues.length > 0 && (
            <ul className="space-y-2 text-sm">
              {openIssues.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                  <span>
                    {o.text}{" "}
                    <Link href={`/jobs/${o.job_id}`} className="text-sm text-muted-foreground hover:underline">
                      open job
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-1.5">
            <Repeat className="size-3.5 text-muted-foreground" />
            Recurring
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recurring.length === 0 && <p className="text-sm text-muted-foreground">No repeat work in the last 12 months.</p>}
          {recurring.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {recurring.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
