import { requireUser } from "@/lib/auth";
import { ActivityStrip } from "@/components/organisms/activity-strip";
import { Board } from "@/components/organisms/board";
import { BoardPage } from "@/components/templates/board-page";
import { resolveBoardDate } from "@/lib/ui/board-layout";
import { loadBoard } from "./data";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/**
 * /today?date=YYYY-MM-DD — the dispatch board for one ET day (default: today
 * in ET). Server renders the first paint from `getSchedule`; the client
 * board then keeps itself current over the SSE feed + /api/board.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  await requireUser();
  const { date: raw } = await searchParams;
  const date = resolveBoardDate(raw);
  const board = await loadBoard(date);
  if (!board) throw new Error(`Could not load the board for ${date}`);

  return <BoardPage main={<Board key={date} initial={board} />} aside={<ActivityStrip className="xl:sticky xl:top-6 xl:w-80 xl:shrink-0" />} />;
}
