"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/atoms/ui/button";

export type BoardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** /today error boundary body: the message plus retry / go-to-today. */
export function BoardError({ error, reset }: BoardErrorProps) {
  const router = useRouter();
  useEffect(() => {
    console.error("[today]", error);
  }, [error]);
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50">
      <h2 className="text-lg font-semibold">The board could not load</h2>
      <p className="mt-1 text-red-900/80 dark:text-red-100/80">{error.message || "Something went wrong talking to the database."}</p>
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={reset}>
          Try again
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push("/today")}>
          Go to today
        </Button>
      </div>
    </div>
  );
}
