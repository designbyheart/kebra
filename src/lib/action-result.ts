/**
 * Shape every server action in the office UI returns, so client components
 * can toast a coded error instead of surfacing a stack trace. Domain functions
 * throw `ToolError` (src/agent/errors.ts); `toActionError` maps it.
 */
export type ActionOk<T> = { ok: true; result: T };
export type ActionErr = { ok: false; code: string; message: string; details?: unknown };
export type ActionResult<T = Record<string, unknown>> = ActionOk<T> | ActionErr;

type ToolErrorLike = { name?: string; code?: string; message?: string; speechHint?: string; details?: unknown };

export function toActionError(err: unknown): ActionErr {
  const e = (err ?? {}) as ToolErrorLike;
  if (e && e.name === "ToolError" && typeof e.code === "string") {
    return { ok: false, code: e.code, message: e.speechHint || e.message || e.code, details: e.details };
  }
  if (err instanceof Error) return { ok: false, code: "error", message: err.message };
  return { ok: false, code: "error", message: "Something went wrong." };
}

/** Wrap a domain call: `return runAction(() => bookJob(...))`. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, result: await fn() };
  } catch (err) {
    return toActionError(err);
  }
}
