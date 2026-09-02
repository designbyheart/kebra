import { redirect } from "next/navigation";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm } from "./login-form";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Gulf Breeze Air</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Kebra Front Desk</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with your office account.</p>
        </div>
        <LoginForm next={next} initialError={sp.error ? "Invalid email or password." : null} />
      </div>
    </div>
  );
}
