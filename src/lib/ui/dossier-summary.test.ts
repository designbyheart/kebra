import { describe, expect, it } from "vitest";
import { fallbackCustomerSummary, summaryParagraphs } from "./dossier-summary";

describe("dossier-summary helpers", () => {
  it("summaryParagraphs splits on blank lines and bullets", () => {
    expect(summaryParagraphs(null)).toEqual([]);
    expect(summaryParagraphs("One.\n\nTwo.\n- three\n• four")).toEqual(["One.", "Two.", "three", "four"]);
  });

  it("fallbackCustomerSummary", () => {
    const base = { displayName: "Ana Perez", kind: null, company: null, jobCount: 3, firstJob: "2024-01-15T12:00:00Z", lastJob: "2026-08-01T12:00:00Z" };
    expect(fallbackCustomerSummary(base, 1, { total_cents: 0, invoiceCount: 0 })).toBe(
      "Ana Perez is a homeowner customer with 1 service address and 3 jobs on file since Jan 15, 2024, last on Aug 1, 2026.",
    );
    expect(fallbackCustomerSummary({ ...base, company: "Acme", firstJob: null, lastJob: null }, 2, { total_cents: 12050, invoiceCount: 2 })).toBe(
      // double space before "Open balance" is the page's original behaviour (join(" ") + leading space)
      "Ana Perez is a business customer with 2 service addresses and 3 jobs on file.  Open balance $120.50 across 2 invoices.",
    );
  });
});
