import { describe, expect, it } from "vitest";
import {
  balanceState,
  bookButtonLabel,
  equipmentCaption,
  equipmentFallback,
  equipmentTitle,
  installedLabel,
  laborCoverageLabel,
  matchLabel,
  partsCoverageLabel,
  partsCoveredLabel,
  partsRegisteredLabel,
  preferenceValue,
  techSuffix,
} from "./customer-view";

describe("customer-view helpers", () => {
  it("balanceState / matchLabel", () => {
    expect(balanceState(0)).toBe("clear");
    expect(balanceState(1)).toBe("due");
    expect(matchLabel("phone", 0.3)).toBe("phone");
    expect(matchLabel("name", 0.874)).toBe("87%");
    expect(matchLabel(undefined, undefined)).toBe("0%");
  });

  it("techSuffix", () => {
    expect(techSuffix([])).toBe(" · unassigned");
    expect(techSuffix(["Ana", "Luis"])).toBe(" · Ana, Luis");
  });

  it("equipment", () => {
    const e = { kind: "air handler", brand: "carrier", tonnage: 3, source_job_id: "j1", line: "raw line" };
    expect(equipmentTitle(e)).toBe("Carrier 3 ton air handler");
    expect(equipmentTitle({ kind: "", source_job_id: "j1", line: "raw line" })).toBe("raw line");
    expect(equipmentFallback([e], ["x"])).toEqual([]);
    expect(equipmentFallback([], ["x"])).toEqual(["x"]);
    expect(equipmentFallback([], undefined)).toEqual([]);
    expect(equipmentCaption(2, 0)).toBe("2 on file");
    expect(equipmentCaption(0, 1)).toBe("from the brief");
    expect(equipmentCaption(0, 0)).toBe("none on file");
    expect(installedLabel(undefined)).toBe("Install date unknown");
    expect(installedLabel("2026-09-02T12:00:00Z")).toBe("Installed Sep 2, 2026");
  });

  it("warranty labels", () => {
    expect(laborCoverageLabel({ covered: false, basis: "" })).toBe("not covered");
    expect(laborCoverageLabel({ covered: true, until: "2027-09-02T12:00:00Z", basis: "" })).toBe("covered to Sep 2, 2027");
    expect(partsCoverageLabel({ covered: true, until: "2027-09-02T12:00:00Z", registered: true, basis: "" })).toBe("covered to Sep 2, 2027");
    expect(partsCoverageLabel({ covered: "likely", registered: "unknown", basis: "" })).toBe("likely to —");
    expect(partsCoverageLabel({ covered: false, registered: false, basis: "" })).toBe("not covered");
    expect(partsCoveredLabel("likely")).toBe("likely covered");
    expect(partsRegisteredLabel("unknown")).toBe("");
    expect(partsRegisteredLabel(false)).toBe(" · not registered");
  });

  it("bookButtonLabel / preferenceValue", () => {
    expect(bookButtonLabel(null)).toBe("Pick an opening");
    expect(bookButtonLabel("Ana Perez")).toBe("Book with Ana");
    expect(preferenceValue(["a", "b"])).toBe("a, b");
    expect(preferenceValue({ x: 1 })).toBe('{"x":1}');
    expect(preferenceValue(3)).toBe("3");
  });
});
