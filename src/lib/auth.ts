import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { emitEvent } from "@/lib/events";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
  type SessionRole,
} from "@/lib/session";

/**
 * Named office logins (PLAN §3 D5). Email + password, bcrypt hashes, signed
 * httpOnly session cookie. No external auth service.
 */

export type Role = SessionRole;
export type CurrentUser = Pick<User, "id" | "email" | "name" | "role" | "employeeId">;

const BCRYPT_ROUNDS = 10;

// --- passwords -------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// --- roles / actor ---------------------------------------------------------

/** Owner or admin. Gate for cancellation approval (D12) and other admin-only actions. */
export function isAdmin(user: Pick<CurrentUser, "role"> | null | undefined): boolean {
  return user?.role === "owner" || user?.role === "admin";
}

/** `ctx.actor` for office-initiated domain calls; `label` is what `payload.actor_label` should carry. */
export function actorFromUser(user: Pick<CurrentUser, "id" | "name">): { userId: string; label: string } {
  return { userId: user.id, label: user.name };
}

// --- lookup ----------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  employeeId: users.employeeId,
} as const;

/**
 * Credential check against the DB. Returns the user on success, null on any
 * failure (unknown email and wrong password are indistinguishable to callers).
 * Runs bcrypt against a dummy hash when the email is unknown so response time
 * does not leak which emails exist.
 */
export async function authenticate(email: string, password: string): Promise<CurrentUser | null> {
  const [row] = await db
    .select({ ...userColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  if (!row) {
    await verifyPassword(password, await dummyHash());
    return null;
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return null;
  const { passwordHash: _hash, ...user } = row;
  void _hash;
  return user;
}

// Hash of a throwaway string, computed once; only used to equalise timing for unknown emails.
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("kebra-unknown-user");
  return dummyHashPromise;
}

export async function findUserById(id: string): Promise<CurrentUser | null> {
  const [row] = await db.select(userColumns).from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

// --- request-scoped helpers (server components + route handlers) ------------

/**
 * The logged-in user for the current request, or null. Verifies the cookie
 * signature, then reloads the row so a deleted user or changed role takes
 * effect immediately.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return findUserById(session.userId);
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Like `getCurrentUser()` but redirects to `/login?next=<path>` when there is
 * no session and throws `ForbiddenError` (status 403) when `roles` is given
 * and the user's role is not in it. In route handlers, catch `ForbiddenError`
 * and respond 403.
 */
export async function requireUser(roles?: readonly Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const next = h.get("x-pathname") ?? "/";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (roles && !roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

// --- login / logout --------------------------------------------------------

/**
 * Verifies credentials, sets the session cookie, stamps `last_login_at` and
 * emits `user.login`. Only callable where cookies can be written (route
 * handlers, server actions). Returns null on bad credentials.
 */
export async function login(email: string, password: string): Promise<CurrentUser | null> {
  const user = await authenticate(email, password);
  if (!user) return null;
  const token = await signSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  await recordLogin(user);
  return user;
}

/** Side effects of a successful login, separate from the cookie so they are testable. */
export async function recordLogin(user: CurrentUser): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await emitEvent({
    actor: "office",
    actorId: user.id,
    type: "user.login",
    entityType: "user",
    entityId: user.id,
    payload: { summary: `${user.name} logged in`, user_id: user.id, actor_label: user.name },
  });
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", sessionCookieOptions(0));
}

/** Only allow same-origin relative paths as post-login destinations. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/login")) return fallback;
  return next;
}
