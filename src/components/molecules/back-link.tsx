import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export type BackLinkProps = { href: string; label: string };

/** "← Jobs" crumb row above a detail page header. */
export function BackLink({ href, label }: BackLinkProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Link href={href} className="inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {label}
      </Link>
    </div>
  );
}
