import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isPublicPath, proxy } from "@/proxy";
import { SESSION_COOKIE, signSession } from "@/lib/session";

const secret = "proxy-test-secret-0123456789abcd";
const grader = { userId: "usr_grader", email: "grader@gulfbreezeair.demo", name: "Grader", role: "admin" as const };
const origin = "http://localhost:3999";

function req(path: string, init: { cookie?: string; headers?: Record<string, string>; method?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`);
  return new NextRequest(new URL(path, origin), { headers, method: init.method ?? "GET" });
}

let prevSecret: string | undefined;
beforeAll(() => {
  prevSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = secret;
});
afterAll(() => {
  if (prevSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = prevSecret;
});

describe("isPublicPath", () => {
  it.each([
    ["/login", true],
    ["/api/health", true],
    ["/api/voice/webhook", true],
    ["/api/agent/tools/ping", true],
    ["/api/auth/login", true],
    ["/api/auth/logout", true],
    ["/_next/static/chunk.js", true],
    ["/favicon.ico", true],
    ["/logo.png", true],
    ["/", false],
    ["/today", false],
    ["/calls", false],
    ["/calls/call_123", false],
    ["/inbox", false],
    ["/api/events/stream", false],
    ["/api/jobs", false],
    ["/loginx", false],
  ])("%s -> public=%s", (path, expected) => {
    expect(isPublicPath(path)).toBe(expected);
  });
});

describe("proxy allow/deny", () => {
  it("redirects a page request without a session to /login?next=<path>", async () => {
    const res = await proxy(req("/calls"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/calls");
  });

  it("keeps the query string in next=", async () => {
    const res = await proxy(req("/jobs?day=2026-09-02"));
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/jobs?day=2026-09-02");
  });

  it("returns 401 JSON for a private API route without a session", async () => {
    const res = await proxy(req("/api/events/stream"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("lets a valid session through and forwards x-pathname", async () => {
    const token = await signSession(grader, { secret });
    const res = await proxy(req("/calls?x=1", { cookie: token }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-middleware-override-headers")).toContain("x-pathname");
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/calls?x=1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("re-issues the cookie when the session is older than a day (sliding)", async () => {
    const token = await signSession(grader, { secret, now: new Date(Date.now() - 2 * 86_400_000) });
    const res = await proxy(req("/today", { cookie: token }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("rejects an expired or forged session", async () => {
    const expired = await signSession(grader, { secret, now: new Date(Date.now() - 8 * 86_400_000) });
    expect((await proxy(req("/today", { cookie: expired }))).status).toBe(307);
    const forged = await signSession(grader, { secret: "some-other-secret-that-is-long" });
    expect((await proxy(req("/today", { cookie: forged }))).status).toBe(307);
  });

  it.each(["/login", "/api/health", "/api/voice/webhook", "/api/agent/tools/ping", "/api/auth/login"])(
    "passes %s through without a session",
    async (path) => {
      const res = await proxy(req(path, { method: path.startsWith("/api/a") ? "POST" : "GET" }));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    },
  );
});

describe("agent tool route keeps its own secret-header auth", () => {
  const agentSecret = "agent-secret-for-tests";
  let prev: string | undefined;
  beforeAll(() => {
    prev = process.env.VAPI_WEBHOOK_SECRET;
    process.env.VAPI_WEBHOOK_SECRET = agentSecret;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.VAPI_WEBHOOK_SECRET;
    else process.env.VAPI_WEBHOOK_SECRET = prev;
  });

  async function callPing(headers: Record<string, string>) {
    const { POST } = await import("@/app/api/agent/tools/[tool]/route");
    const r = req("/api/agent/tools/ping", { method: "POST", headers: { "content-type": "application/json", ...headers } });
    // proxy lets it through with no session...
    expect((await proxy(r)).headers.get("x-middleware-next")).toBe("1");
    // ...and the handler decides on the secret.
    return POST(new NextRequest(r.url, { method: "POST", headers: r.headers, body: "{}" }), {
      params: Promise.resolve({ tool: "ping" }),
    });
  }

  it("200 with the right x-agent-secret and no session", async () => {
    const res = await callPing({ "x-agent-secret": agentSecret });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; result: { pong: boolean } };
    expect(body.ok).toBe(true);
    expect(body.result.pong).toBe(true);
  });

  it("401 without the secret", async () => {
    const res = await callPing({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("401 with a wrong secret", async () => {
    const res = await callPing({ "x-agent-secret": "wrong" });
    expect(res.status).toBe(401);
  });
});
