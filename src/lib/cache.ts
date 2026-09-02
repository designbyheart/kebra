/**
 * Tiny in-memory TTL cache. Process-local, no persistence, no external deps.
 * Used by the web tools (search / weather) to keep repeat questions fast and
 * to avoid hammering upstream APIs during a call.
 *
 * - Values expire `ttlMs` after being set (per-entry override supported).
 * - `getOrSet` de-duplicates concurrent misses for the same key so a burst of
 *   identical requests triggers a single upstream fetch.
 * - Failures are never cached.
 * - Bounded: when `maxEntries` is exceeded, expired entries are purged first,
 *   then the oldest insertion is evicted.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<V>>();

  constructor(
    private readonly defaultTtlMs: number,
    private readonly maxEntries = 500,
    /** Injectable clock (ms since epoch) so tests can control expiry. */
    private readonly clock: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.clock()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: V, ttlMs: number = this.defaultTtlMs): void {
    // Re-insert so Map iteration order reflects recency of insertion.
    this.store.delete(key);
    if (this.store.size >= this.maxEntries) this.evict();
    this.store.set(key, { value, expiresAt: this.clock() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.pending.clear();
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Return the cached value or compute it with `fn`, caching the result.
   * Concurrent callers for the same key share one in-flight promise.
   */
  async getOrSet(key: string, fn: () => Promise<V>, ttlMs: number = this.defaultTtlMs): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const p = (async () => {
      try {
        const value = await fn();
        this.set(key, value, ttlMs);
        return value;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, p);
    return p;
  }

  private evict(): void {
    const now = this.clock();
    for (const [k, v] of this.store) {
      if (v.expiresAt <= now) this.store.delete(k);
    }
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
  }
}
