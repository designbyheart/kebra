import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  actorFromUser,
  authenticate,
  findUserById,
  hashPassword,
  isAdmin,
  safeNextPath,
  verifyPassword,
} from "@/lib/auth";

describe("passwords", () => {
  it("hashes with bcrypt and verifies", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
    expect(await verifyPassword("correct horse", "")).toBe(false);
    expect(await verifyPassword("correct horse", "not-a-hash")).toBe(false);
  });

  it("produces a different hash each time (salted)", async () => {
    expect(await hashPassword("x")).not.toBe(await hashPassword("x"));
  });
});

describe("roles and actor", () => {
  it("isAdmin is owner or admin", () => {
    expect(isAdmin({ role: "owner" })).toBe(true);
    expect(isAdmin({ role: "admin" })).toBe(true);
    expect(isAdmin({ role: "office" })).toBe(false);
    expect(isAdmin({ role: "tech" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("actorFromUser maps id and name", () => {
    expect(actorFromUser({ id: "usr_1", name: "Alina Farrell" })).toEqual({ userId: "usr_1", label: "Alina Farrell" });
  });

  it("safeNextPath only allows same-origin relative paths", () => {
    expect(safeNextPath("/calls")).toBe("/calls");
    expect(safeNextPath("/calls?x=1")).toBe("/calls?x=1");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/login?next=/x")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null, "/today")).toBe("/today");
  });
});

describe("authenticate (real DB)", () => {
  const id = newId("usr");
  const email = `test.${id.slice(-8)}@gulfbreezeair.demo`;
  const password = "Sup3r-secret!";

  beforeAll(async () => {
    await db.insert(users).values({ id, email, name: "Test User", role: "office", passwordHash: await hashPassword(password) });
  });
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, id));
  });

  it("returns the user for correct credentials (case-insensitive email) without the hash", async () => {
    const u = await authenticate(email.toUpperCase(), password);
    expect(u).toEqual({ id, email, name: "Test User", role: "office", employeeId: null });
    expect(u && "passwordHash" in u).toBe(false);
  });

  it("returns null for a wrong password or unknown email", async () => {
    expect(await authenticate(email, "nope")).toBeNull();
    expect(await authenticate("nobody@gulfbreezeair.demo", password)).toBeNull();
  });

  it("findUserById", async () => {
    expect((await findUserById(id))?.email).toBe(email);
    expect(await findUserById("usr_missing")).toBeNull();
  });
});
