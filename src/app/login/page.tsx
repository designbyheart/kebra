import { redirect } from "next/navigation";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm } from "@/components/organisms/login-form";
import { OverlayPage } from "@/components/templates/overlay-page";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    // Covers the app shell (sidebar) rendered by the root layout.
    <OverlayPage eyebrow="Gulf Breeze Air" title="Kebra Front Desk" description="Sign in with your office account.">
      <LoginForm next={next} initialError={(sp.error && "Invalid email or password.") || null} />
    </OverlayPage>
  );
}
