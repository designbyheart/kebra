import { describe, expect, it } from "vitest";
import { arrivalWindowLabel, initialStatusTarget, isTerminalStatus, jobTimelineLabel, rescheduleLockedReason, statusOptionLabel, STATUS_TARGETS } from "./job-status";

describe("job status helpers", () => {
  it("tells the two complete statuses apart in option labels", () => {
    expect(statusOptionLabel("complete rated")).toBe("Complete (rated)");
    expect(statusOptionLabel("scheduled")).toBe("Scheduled");
  });

  it("treats completed and canceled jobs as terminal", () => {
    expect(isTerminalStatus("complete unrated")).toBe(true);
    expect(isTerminalStatus("pro canceled")).toBe(true);
    expect(isTerminalStatus("scheduled")).toBe(false);
  });

  it("never offers pending_cancellation as a target and maps it to scheduled", () => {
    expect(STATUS_TARGETS).not.toContain("pending_cancellation");
    expect(initialStatusTarget("pending_cancellation")).toBe("scheduled");
    expect(initialStatusTarget("in progress")).toBe("in progress");
  });

  it("locks rescheduling for anything but scheduled / needs scheduling", () => {
    expect(rescheduleLockedReason("scheduled")).toBeNull();
    expect(rescheduleLockedReason("needs scheduling")).toBeNull();
    expect(rescheduleLockedReason("in progress")).toMatch(/already on this job/);
    expect(rescheduleLockedReason("pending_cancellation")).toMatch(/Inbox/);
    expect(rescheduleLockedReason("user canceled")).toMatch(/can't be rescheduled/);
  });

  it("formats the arrival window", () => {
    expect(arrivalWindowLabel(120)).toBe("120 min");
    expect(arrivalWindowLabel(null)).toBe("—");
    expect(arrivalWindowLabel(0)).toBe("—");
  });

  it("picks the latest lifecycle milestone", () => {
    const created = new Date("2026-09-01T12:00:00Z");
    expect(jobTimelineLabel({ startedAt: created, completedAt: null, canceledAt: null, createdAt: created })).toMatch(/^Started /);
    expect(jobTimelineLabel({ startedAt: null, completedAt: created, canceledAt: null, createdAt: created })).toMatch(/^Completed /);
    expect(jobTimelineLabel({ startedAt: null, completedAt: null, canceledAt: created, createdAt: created })).toMatch(/^Canceled /);
    expect(jobTimelineLabel({ startedAt: null, completedAt: null, canceledAt: null, createdAt: created })).toMatch(/^Created /);
  });
});
