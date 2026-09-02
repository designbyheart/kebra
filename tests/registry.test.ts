import { describe, expect, it } from "vitest";
import { registry, listTools } from "@/agent/registry";

describe("agent tool registry", () => {
  it("lists ping", () => {
    expect(listTools().map((t) => t.name)).toContain("ping");
  });

  it("ping validates input and returns ET time", async () => {
    const ping = registry.ping;
    expect(ping.input.safeParse({ echo: 123 }).success).toBe(false);
    const parsed = ping.input.safeParse({ echo: "hi" });
    expect(parsed.success).toBe(true);
    const result = (await ping.handler(parsed.success ? parsed.data : {}, {
      callId: null,
      actor: "office",
    })) as { pong: boolean; echo: string | null; tz: string; nowET: string };
    expect(result.pong).toBe(true);
    expect(result.echo).toBe("hi");
    expect(result.tz).toBe("America/New_York");
    expect(result.nowET).toMatch(/E[SD]T$/);
  });

  it("ping accepts an empty body", async () => {
    const parsed = registry.ping.input.safeParse(undefined);
    expect(parsed.success).toBe(true);
  });
});
