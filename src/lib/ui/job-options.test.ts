import { describe, expect, it } from "vitest";
import { initialServiceType, rescheduleConfirmLabel, slotKey } from "./job-options";

describe("job options", () => {
  it("keys a slot by window and tech", () => {
    expect(slotKey({ window_start: "2026-09-03T13:00:00Z", employee_id: "pro_1" })).toBe("2026-09-03T13:00:00Z|pro_1");
  });

  it("keeps the current service type only when it is still offered", () => {
    const options = [{ id: "diagnostic" }, { id: "install" }];
    expect(initialServiceType("install", options)).toBe("install");
    expect(initialServiceType("retired", options)).toBe("diagnostic");
    expect(initialServiceType(null, options)).toBe("diagnostic");
  });

  it("labels the confirm button by state", () => {
    expect(rescheduleConfirmLabel(true, { window_label: "Thu 9–11" })).toBe("Moving…");
    expect(rescheduleConfirmLabel(false, { window_label: "Thu 9–11" })).toBe("Move to Thu 9–11");
    expect(rescheduleConfirmLabel(false, null)).toBe("Pick an opening");
  });
});
