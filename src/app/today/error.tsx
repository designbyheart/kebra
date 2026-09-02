"use client";

import { BoardError } from "@/components/organisms/board-error";

export default function TodayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <BoardError error={error} reset={reset} />;
}
