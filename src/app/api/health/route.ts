import { sql as pg } from "@/db";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let dbOk = false;
  try {
    await pg`select 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return Response.json(
    { ok: dbOk, db: dbOk, version: pkg.version, time: new Date().toISOString() },
    { status: dbOk ? 200 : 503 },
  );
}
