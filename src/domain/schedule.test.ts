import "dotenv/config";
import { describe, expect, it } from "vitest";
import { computeGaps, getSchedule, parseDateET, scheduleSpeech } from "./schedule";

const NOW = new Date("2026-09-02T16:00:00Z"); // Wed Sep 2, noon ET
const TANYA = "pro_9ff5524f64df4ed9be40f5ef8b7b9c5f";
const TOBIAS = "pro_f936c609f2944d67908096ad47f68bf2";

describe("parseDateET", () => {
  it("bounds an ET calendar day in UTC", () => {
    const d = parseDateET("2026-09-02");
    expect(d?.start.toISOString()).toBe("2026-09-02T04:00:00.000Z");
    expect(d?.end.toISOString()).toBe("2026-09-03T04:00:00.000Z");
    expect(d?.dow).toBe(3);
    expect(parseDateET("2026-02-30")).toBeNull();
    expect(parseDateET("tomorrow")).toBeNull();
  });
});

describe("computeGaps", () => {
  const open = new Date("2026-09-02T12:00:00Z"); // 8 AM ET
  const close = new Date("2026-09-02T22:00:00Z"); // 6 PM ET
  it("finds free blocks between jobs and against business hours", () => {
    const gaps = computeGaps(
      [
        { start: new Date("2026-09-02T14:00:00Z"), end: new Date("2026-09-02T16:00:00Z") },
        { start: new Date("2026-09-02T19:00:00Z"), end: new Date("2026-09-02T21:00:00Z") },
      ],
      open,
      close,
    );
    expect(gaps.map((g) => g.label)).toEqual(["8 AM to 10 AM", "noon to 3 PM", "5 PM to 6 PM"]);
  });
  it("merges overlapping blocks and ignores short gaps", () => {
    const gaps = computeGaps(
      [
        { start: new Date("2026-09-02T14:00:00Z"), end: new Date("2026-09-02T16:00:00Z") },
        { start: new Date("2026-09-02T15:00:00Z"), end: new Date("2026-09-02T17:00:00Z") },
        { start: new Date("2026-09-02T17:15:00Z"), end: new Date("2026-09-02T22:00:00Z") },
      ],
      open,
      close,
    );
    expect(gaps.map((g) => g.label)).toEqual(["8 AM to 10 AM"]);
  });
  it("is the whole day when a tech has nothing", () => {
    expect(computeGaps([], open, close).map((g) => g.label)).toEqual(["8 AM to 6 PM"]);
    expect(computeGaps([], null, null)).toEqual([]);
  });
});

describe("getSchedule (db)", () => {
  it("reports the 10 scheduled jobs on 2026-09-02 and the techs on them", async () => {
    const s = await getSchedule("2026-09-02", null, NOW);
    expect(s).not.toBeNull();
    expect(s!.summary.total).toBe(10);
    expect(s!.jobs).toHaveLength(10);
    expect(s!.summary.by_status).toEqual({ scheduled: 10 });
    expect(s!.summary.canceled).toBe(2);
    expect(s!.summary.installs).toBe(1);
    expect(s!.summary.unassigned).toBe(0);
    expect(s!.summary.techs_working).toBe(9);
    expect(s!.summary.first_start).toBe("2026-09-02T13:00:00.000Z");
    expect(s!.summary.last_end).toBe("2026-09-02T21:00:00.000Z");
    expect(s!.jobs.map((j) => j.invoice_number)).toEqual(["5508", "5425", "5507", "5500", "5301", "5303", "5466", "5501", "5306", "5083"]);
    expect(s!.jobs.every((j) => j.status !== "user canceled" && j.status !== "pro canceled")).toBe(true);

    const byName = Object.fromEntries(s!.techs.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(
      ["Andre Nolan", "Audrey Farrell", "Esther Brennan", "Selena Hayes", "Tamara Porter", "Tanya Sawyer", "Tobias McGuire", "Yvonne Aguilar", "Zoe Hoffman"].sort(),
    );
    expect(byName["Esther Brennan"].job_count).toBe(2);
    expect(byName["Tobias McGuire"].gaps.map((g) => g.label)).toEqual(["8 AM to 10 AM", "noon to 3 PM", "5 PM to 6 PM"]);
    expect(byName["Tanya Sawyer"].gaps.map((g) => g.label)).toEqual(["8 AM to 10 AM", "11 AM to 6 PM"]);

    const install = s!.jobs.find((j) => j.invoice_number === "5466")!;
    expect(install.is_install).toBe(true);
    expect(install.tech_names).toEqual(["Audrey Farrell", "Selena Hayes", "Tamara Porter"]);
    expect(install.window_label).toBe("Wednesday September 2nd, 10 AM to noon");
    expect(install.address_label).toBe("8592 Rudder Landing Ln, Miami Beach");
  });

  it("speaks an owner-style sentence", async () => {
    const s = await getSchedule("2026-09-02", null, NOW);
    expect(s!.speech_hint).toBe("Ten jobs today across nine techs, one install.");
  });

  it("focuses on one tech when employee_id is given", async () => {
    const s = await getSchedule("2026-09-02", TANYA, NOW);
    expect(s!.jobs.map((j) => j.invoice_number)).toEqual(["5500"]);
    expect(s!.techs).toHaveLength(1);
    expect(s!.speech_hint).toBe("Tanya has one job today, first at 10 AM, wrapping up by 11 AM, with a free block from 11 AM to 6 PM.");
    const t = await getSchedule("2026-09-02", TOBIAS, NOW);
    expect(t!.summary.total).toBe(2);
    expect(t!.speech_hint).toMatch(/^Tobias has two jobs today, first at 10 AM, wrapping up by 5 PM, with a free block from noon to 3 PM\.$/);
  });

  it("handles an empty day and invalid dates", async () => {
    const s = await getSchedule("2026-09-06", null, NOW);
    expect(s!.summary.total).toBe(0);
    expect(s!.speech_hint).toBe("Nothing on the board on Sunday September 6th.");
    expect(await getSchedule("2026-13-01", null, NOW)).toBeNull();
  });

  it("phrases extras in the summary", () => {
    const base = { total: 10, by_status: {}, techs_working: 6, first_start: null, last_end: null, unassigned: 1, needs_scheduling: 0, in_progress: 0, pending_cancellation: 0, canceled: 0, installs: 0, callbacks: 2 };
    expect(scheduleSpeech("2026-09-02", base, [], null, NOW)).toBe("Ten jobs today across six techs, two callbacks and one still unassigned.");
    expect(scheduleSpeech("2026-09-03", { ...base, callbacks: 0, unassigned: 0, total: 1, techs_working: 1 }, [], null, NOW)).toBe("One job tomorrow across one tech.");
  });
});
