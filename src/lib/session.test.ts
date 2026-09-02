import { describe, expect, it } from "vitest";
import {
  SESSION_REFRESH_AFTER_SECONDS,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  shouldRefresh,
  signSession,
  verifySession,
} from "@/lib/session";

const secret = "test-secret-at-least-16-chars-long";
const user = { userId: "usr_1", email: "grader@gulfbreezeair.demo", name: "Grader", role: "admin" as const };

describe("session tokens", () => {
  it("signs and verifies a round trip", async () => {
    const now = new Date("2026-09-02T12:00:00Z");
    const token = await signSession(user, { secret, now });
    const payload = await verifySession(token, { secret, now });
    expect(payload).toMatchObject(user);
    expect(payload!.exp - payload!.iat).toBe(SESSION_TTL_SECONDS);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(user, { secret });
    expect(await verifySession(token, { secret: "another-secret-that-is-long" })).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(user, { secret });
    const [h, p, s] = token.split(".");
    const body = JSON.parse(Buffer.from(p, "base64url").toString());
    body.role = "owner";
    const forged = `${h}.${Buffer.from(JSON.stringify(body)).toString("base64url")}.${s}`;
    expect(await verifySession(forged, { secret })).toBeNull();
  });

  it("rejects garbage and empty input without throwing", async () => {
    expect(await verifySession("", { secret })).toBeNull();
    expect(await verifySession(undefined, { secret })).toBeNull();
    expect(await verifySession("not.a.jwt", { secret })).toBeNull();
  });

  it("expires after 7 days", async () => {
    const issued = new Date("2026-09-02T12:00:00Z");
    const token = await signSession(user, { secret, now: issued });
    const sixDays = new Date(issued.getTime() + 6 * 86_400_000);
    const eightDays = new Date(issued.getTime() + 8 * 86_400_000);
    expect(await verifySession(token, { secret, now: sixDays })).not.toBeNull();
    expect(await verifySession(token, { secret, now: eightDays })).toBeNull();
  });

  it("asks for a refresh once the token is a day old (sliding expiry)", async () => {
    const issued = new Date("2026-09-02T12:00:00Z");
    const token = await signSession(user, { secret, now: issued });
    const payload = (await verifySession(token, { secret, now: issued }))!;
    expect(shouldRefresh(payload, new Date(issued.getTime() + 60_000))).toBe(false);
    expect(shouldRefresh(payload, new Date(issued.getTime() + (SESSION_REFRESH_AFTER_SECONDS + 1) * 1000))).toBe(true);
  });

  it("cookie options are httpOnly, lax, path=/", () => {
    const o = sessionCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(SESSION_TTL_SECONDS);
    expect(sessionCookieOptions(0).maxAge).toBe(0);
  });
});
