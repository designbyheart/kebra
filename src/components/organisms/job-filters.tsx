import Link from "next/link";
import { FormField } from "@/components/atoms/form-field";
import { NativeSelect } from "@/components/atoms/native-select";
import { Button } from "@/components/atoms/ui/button";
import { Input } from "@/components/atoms/ui/input";
import { DateRangeToggle } from "@/components/molecules/date-range-toggle";
import { WORK_STATUSES } from "@/lib/job-constants";
import { JOB_SOURCES, JOB_SOURCE_FILTER_LABEL, type JobFilters as JobFilterValues } from "@/lib/ui/job-filter-params";
import type { TechOption } from "@/lib/ui/job-options";
import { statusOptionLabel } from "@/lib/ui/job-status";

export type JobFiltersProps = { filters: JobFilterValues; techs: TechOption[]; tags: string[] };

/** Plain GET form: the URL is the state. */
export function JobFilters({ filters, techs, tags }: JobFiltersProps) {
  const f = filters;
  const active = Boolean(f.statusParam || f.tech || f.tag || f.source || f.q || !f.defaultRange);
  return (
    <form method="get" action="/jobs" className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 text-sm">
      <FormField label="Search">
        <Input name="q" defaultValue={f.q ?? ""} placeholder="Customer, street, invoice #…" className="w-56" />
      </FormField>
      <FormField label="Status">
        <NativeSelect name="status" defaultValue={f.statusParam} className="max-w-full dark:bg-input/30">
          <option value="">Any status</option>
          <option value="open">Open (scheduled, in progress, needs scheduling, pending)</option>
          {WORK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusOptionLabel(s)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Tech">
        <NativeSelect name="tech" defaultValue={f.tech ?? ""} className="max-w-full dark:bg-input/30">
          <option value="">Any tech</option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="From">
        <Input type="date" name="from" defaultValue={f.from ?? ""} className="w-38" />
      </FormField>
      <FormField label="To">
        <Input type="date" name="to" defaultValue={f.to ?? ""} className="w-38" />
      </FormField>
      <FormField label="Tag">
        <NativeSelect name="tag" defaultValue={f.tag ?? ""} className="max-w-48 dark:bg-input/30">
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Source">
        <NativeSelect name="source" defaultValue={f.source ?? ""} className="max-w-full dark:bg-input/30">
          <option value="">Any source</option>
          {JOB_SOURCES.map((s) => (
            <option key={s} value={s}>
              {JOB_SOURCE_FILTER_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="flex items-center gap-2 pb-px">
        <Button type="submit" size="sm">
          Apply
        </Button>
        <DateRangeToggle filters={f} />
        {active && (
          <Link href="/jobs" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            Reset
          </Link>
        )}
      </div>
    </form>
  );
}
