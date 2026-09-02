/**
 * DB-backed check of `updateTask` (W2-D). Inserts a throwaway task, walks it
 * through assign → start → resolve → reopen, asserts one `task.updated` event
 * per write, and removes everything it created in `finally`.
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, tasks, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { updateTask } from "./update-task";

const TASK_ID = newId("tsk");

async function cleanup() {
  await db.delete(events).where(and(eq(events.entityType, "task"), eq(events.entityId, TASK_ID)));
  await db.delete(tasks).where(eq(tasks.id, TASK_ID));
}

afterAll(cleanup);

describe("updateTask (db)", () => {
  it("moves status, sets/clears the assignee and emits exactly one task.updated per write", async () => {
    const [officeUser] = await db.select({ id: users.id, name: users.name }).from(users).limit(1);
    expect(officeUser).toBeTruthy();
    const who = { actor: "office" as const, actorId: officeUser.id };

    try {
      await db.insert(tasks).values({ id: TASK_ID, kind: "callback", status: "open", title: "[test] call back Sylvia" });

      const a = await updateTask(TASK_ID, { assignedTo: officeUser.id }, who);
      expect(a).toMatchObject({ task_id: TASK_ID, from_status: "open", to_status: "open", assigned_to: officeUser.id });

      const b = await updateTask(TASK_ID, { status: "in_progress" }, who);
      expect(b).toMatchObject({ from_status: "open", to_status: "in_progress", assigned_to: officeUser.id });

      // same status again → invalid_state
      await expect(updateTask(TASK_ID, { status: "in_progress" }, who)).rejects.toMatchObject({ code: "invalid_state" });

      const c = await updateTask(TASK_ID, { status: "done" }, who);
      expect(c.to_status).toBe("done");
      const [doneRow] = await db.select().from(tasks).where(eq(tasks.id, TASK_ID));
      expect(doneRow.resolvedAt).toBeInstanceOf(Date);

      const d = await updateTask(TASK_ID, { status: "open", assignedTo: null }, who);
      expect(d).toMatchObject({ from_status: "done", to_status: "open", assigned_to: null });
      const [openRow] = await db.select().from(tasks).where(eq(tasks.id, TASK_ID));
      expect(openRow.resolvedAt).toBeNull();
      expect(openRow.assignedTo).toBeNull();

      const evs = await db
        .select()
        .from(events)
        .where(and(eq(events.entityType, "task"), eq(events.entityId, TASK_ID)))
        .orderBy(events.id);
      expect(evs).toHaveLength(4);
      expect(evs.every((e) => e.type === "task.updated" && e.actor === "office" && e.actorId === officeUser.id)).toBe(true);
      expect(evs[1].payload).toMatchObject({ actor_label: officeUser.name, from_status: "open", to_status: "in_progress", task_id: TASK_ID });
      expect(String(evs[0].payload.summary)).toBe(`${officeUser.name} assigned the callback to ${officeUser.name}: [test] call back Sylvia`);
      expect(String(evs[3].payload.summary)).toBe(`${officeUser.name} reopened the callback and cleared the assignee: [test] call back Sylvia`);
    } finally {
      await cleanup();
    }
  });

  it("rejects unknown tasks and unknown assignees", async () => {
    await expect(updateTask("tsk_does_not_exist", { status: "done" }, { actor: "office", actorId: null })).rejects.toMatchObject({ code: "not_found" });
  });
});
