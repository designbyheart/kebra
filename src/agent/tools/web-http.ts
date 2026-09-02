// Owned by W1-E. Shared HTTP plumbing for the web tools (search / weather).

export class HttpTimeoutError extends Error {
  constructor(
    readonly url: string,
    readonly timeoutMs: number,
  ) {
    super(`request to ${safeHost(url)} timed out after ${timeoutMs} ms`);
    this.name = "HttpTimeoutError";
  }
}

export class HttpStatusError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`request to ${safeHost(url)} failed with HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

/**
 * `fetch` a JSON document with a hard deadline enforced by an AbortController.
 * Throws HttpTimeoutError on deadline, HttpStatusError on non-2xx, and lets
 * network errors (TypeError) propagate. Never logs headers or bodies.
 */
export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new HttpTimeoutError(url, timeoutMs)), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new HttpStatusError(url, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (controller.signal.aborted) throw new HttpTimeoutError(url, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Host only, for error messages (query strings may carry user input). */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "upstream";
  }
}
