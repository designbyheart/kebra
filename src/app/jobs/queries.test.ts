import "dotenv/config";
import { describe, expect, it } from "vitest";
import { parseJobFilters } from "@/components/jobs/job-filter-params";
import { listJobs, listTagOptions, listTechOptions, loadJobPage, resolveJobId } from "./queries";

const TODAY = "2026-09-02";

describe("jobs queries (db, read-only)", () => {
  it("lists the next two weeks by default, soonest first, with techs attached", async () => {
    const f = parseJobFilters({}, TODAY);
    const list = await listJobs(f, TODAY);
    expect(list.direction).toBe("asc");
    expect(list.total).toBeGreaterThan(0);
    expect(list.rows.length).toBeLessThanOrEqual(200);
    for (let i = 1; i < list.rows.length; i++) {
      const a = list.rows[i - 1].scheduledStart?.getTime() ?? Infinity;
      const b = list.rows[i].scheduledStart?.getTime() ?? Infinity;
      expect(a).toBeLessThanOrEqual(b);
    }
    expect(list.rows.some((r) => r.techs.length > 0)).toBe(true);
  });

  it("filters by tech, status and tag", async () => {
    const techs = await listTechOptions();
    expect(techs.length).toBeGreaterThan(0);
    const tags = await listTagOptions();
    expect(tags).not.toContain("Pipeline Automation");
    expect(tags).toContain("Service Callback");

    const byTech = await listJobs(parseJobFilters({ tech: techs[0].id, dates: "all", status: "complete rated" }, TODAY), TODAY);
    expect(byTech.rows.every((r) => r.workStatus === "complete rated" && r.techs.some((t) => t.employee_id === techs[0].id))).toBe(true);

    const byTag = await listJobs(parseJobFilters({ tag: "Service Callback", dates: "all" }, TODAY), TODAY);
    expect(byTag.total).toBeGreaterThan(0);
    expect(byTag.direction).toBe("desc");
  });

  it("resolves an invoice number and loads the detail bundle", async () => {
    const list = await listJobs(parseJobFilters({ q: "Grouper Landing", dates: "all" }, TODAY), TODAY);
    const withInvoice = list.rows.find((r) => r.invoiceNumber);
    expect(withInvoice).toBeDefined();
    expect(await resolveJobId(withInvoice!.invoiceNumber!)).toBeTruthy();
    const page = await loadJobPage(withInvoice!.id);
    expect(page).not.toBeNull();
    expect(page!.customerName.length).toBeGreaterThan(0);
    expect(Array.isArray(page!.notes)).toBe(true);
    expect(await resolveJobId("job_does_not_exist")).toBeNull();
  });
});
