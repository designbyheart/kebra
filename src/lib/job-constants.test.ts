import { describe, expect, it } from "vitest";
import { jobPriorityEnum, jobSourceEnum, workStatusEnum } from "@/db/schema";
import { JOB_PRIORITIES, JOB_SOURCES, WORK_STATUSES } from "./job-constants";

describe("job-constants mirrors the pg enums", () => {
  it("work_status", () => expect([...WORK_STATUSES]).toEqual([...workStatusEnum.enumValues]));
  it("job_source", () => expect([...JOB_SOURCES]).toEqual([...jobSourceEnum.enumValues]));
  it("job_priority", () => expect([...JOB_PRIORITIES]).toEqual([...jobPriorityEnum.enumValues]));
});
