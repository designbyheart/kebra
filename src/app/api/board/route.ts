import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isValidDate, resolveBoardDate } from "@/components/board/layout";
import { loadBoard } from "@/app/today/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/board?date=YYYY-MM-DD — the Today board as JSON, for the client's
 * live refetch. Same shape the page renders on the server (`BoardData`).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("date");
  if (raw && !isValidDate(raw)) {
    return NextResponse.json({ ok: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const date = resolveBoardDate(raw);
  try {
    const board = await loadBoard(date);
    if (!board) return NextResponse.json({ ok: false, error: "bad date" }, { status: 400 });
    return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/board]", err);
    return NextResponse.json({ ok: false, error: "board unavailable" }, { status: 500 });
  }
}
