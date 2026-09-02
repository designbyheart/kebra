"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/atoms/ui/button";
import { Input } from "@/components/atoms/ui/input";
import { Label } from "@/components/atoms/ui/label";

const SUBMIT_LABEL = { pending: "Signing in…", idle: "Sign in" } as const;

export type LoginFormProps = { next: string; initialError: string | null };

/** Email + password form posting to /api/auth/login; works without JavaScript too. */
export function LoginForm({ next, initialError }: LoginFormProps) {
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);
  const submitState = (pending && "pending") || "idle";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; next?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Sign in failed. Try again.");
        setPending(false);
        return;
      }
      // Full navigation so server components re-render with the new cookie.
      window.location.assign(data.next ?? next);
    } catch {
      setError("Could not reach the server. Try again.");
      setPending(false);
    }
  }

  return (
    // Also works as a plain form post if JavaScript is unavailable.
    <form method="post" action="/api/auth/login" onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus placeholder="you@gulfbreezeair.demo" aria-invalid={Boolean(error) || undefined} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(error) || undefined} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {SUBMIT_LABEL[submitState]}
      </Button>
    </form>
  );
}
