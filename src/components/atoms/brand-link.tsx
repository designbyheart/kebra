import Link from "next/link";

export type BrandLinkProps = { href?: string; label?: string };

/** Product name in the sidebar header; links home. */
export function BrandLink({ href = "/today", label = "Kebra Front Desk" }: BrandLinkProps) {
  return (
    <Link href={href} className="text-sm font-semibold tracking-tight">
      {label}
    </Link>
  );
}
