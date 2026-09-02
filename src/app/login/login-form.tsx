"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

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
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="you@gulfbreezeair.demo"
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
