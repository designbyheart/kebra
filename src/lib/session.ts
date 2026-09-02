import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

/**
 * Signed session cookie (HS256 via `jose`, so it verifies in the edge
 * middleware and in Node route handlers alike). The cookie carries only what
 * the middleware needs to make an allow/deny decision; `getCurrentUser()`
 * reloads the row so role/name changes take effect on the next request.
 */

export const SESSION_COOKIE = "kebra_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
/** Re-issue the cookie once it is older than this (sliding expiry). */
export const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60;

export type SessionRole = "owner" | "admin" | "office" | "tech";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: SessionRole;
  /** issued-at, unix seconds */
  iat: number;
  /** expiry, unix seconds */
  exp: number;
};

const ROLES: readonly SessionRole[] = ["owner", "admin", "office", "tech"];

function keyFrom(secret?: string): Uint8Array {
  const s = secret ?? process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not set (or is too short)");
  return new TextEncoder().encode(s);
}

export type SignOptions = { secret?: string; now?: Date; ttlSeconds?: number };

export async function signSession(
  user: Pick<SessionPayload, "userId" | "email" | "name" | "role">,
  opts: SignOptions = {},
): Promise<string> {
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const ttl = opts.ttlSeconds ?? SESSION_TTL_SECONDS;
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.userId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + ttl)
    .sign(keyFrom(opts.secret));
}

export type VerifyOptions = { secret?: string; now?: Date };

/** Returns the payload for a valid, unexpired token; null otherwise (never throws on bad input). */
export async function verifySession(token: string | undefined | null, opts: VerifyOptions = {}): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keyFrom(opts.secret), {
      algorithms: ["HS256"],
      currentDate: opts.now,
    });
    const role = payload.role;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof role !== "string" ||
      !ROLES.includes(role as SessionRole) ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      role: role as SessionRole,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (err) {
    if (err instanceof joseErrors.JOSEError) return null;
    if (err instanceof Error && err.message.startsWith("SESSION_SECRET")) throw err;
    return null;
  }
}

/** True when the session is valid but old enough that we should re-issue it. */
export function shouldRefresh(session: SessionPayload, now: Date = new Date()): boolean {
  const nowSec = Math.floor(now.getTime() / 1000);
  return nowSec - session.iat >= SESSION_REFRESH_AFTER_SECONDS;
}

/** Cookie attributes shared by login, logout and the middleware refresh. */
export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
