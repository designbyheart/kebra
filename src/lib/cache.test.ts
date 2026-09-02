import { describe, it, expect, vi } from "vitest";
import { TtlCache } from "@/lib/cache";

function makeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe("TtlCache", () => {
  it("stores and returns values until they expire", () => {
    const clock = makeClock();
    const c = new TtlCache<string>(1000, 100, clock.now);
    c.set("a", "x");
    expect(c.get("a")).toBe("x");
    expect(c.has("a")).toBe(true);
    clock.tick(999);
    expect(c.get("a")).toBe("x");
    clock.tick(1);
    expect(c.get("a")).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it("honours a per-entry ttl override", () => {
    const clock = makeClock();
    const c = new TtlCache<number>(1000, 100, clock.now);
    c.set("short", 1, 10);
    c.set("long", 2);
    clock.tick(11);
    expect(c.get("short")).toBeUndefined();
    expect(c.get("long")).toBe(2);
  });

  it("getOrSet computes once and de-duplicates concurrent misses", async () => {
    const c = new TtlCache<string>(1000);
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return "v";
    });
    const [a, b] = await Promise.all([c.getOrSet("k", fn), c.getOrSet("k", fn)]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(fn).toHaveBeenCalledTimes(1);
    await c.getOrSet("k", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const c = new TtlCache<string>(1000);
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    await expect(c.getOrSet("k", fn)).rejects.toThrow("boom");
    expect(c.size).toBe(0);
    await expect(c.getOrSet("k", fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("evicts expired entries first, then the oldest, when full", () => {
    const clock = makeClock();
    const c = new TtlCache<number>(1000, 2, clock.now);
    c.set("a", 1, 10);
    c.set("b", 2);
    clock.tick(20);
    c.set("c", 3); // "a" expired → purged, no need to drop "b"
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
    c.set("d", 4); // full with fresh entries → oldest ("b") goes
    expect(c.get("b")).toBeUndefined();
    expect(c.get("c")).toBe(3);
    expect(c.get("d")).toBe(4);
    expect(c.size).toBe(2);
  });

  it("clear empties the cache", () => {
    const c = new TtlCache<number>(1000);
    c.set("a", 1);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get("a")).toBeUndefined();
  });
});
