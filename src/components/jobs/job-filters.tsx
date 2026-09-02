import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WORK_STATUSES } from "@/lib/job-constants";
import { STATUS_LABEL } from "./status-badge";
import { filtersToQuery, JOB_SOURCES, type JobFilters } from "./job-filter-params";
import type { TechOption } from "@/app/jobs/queries";

const selectCls = "h-8 max-w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const SOURCE_LABEL: Record<(typeof JOB_SOURCES)[number], string> = { import: "Imported", agent: "Agent", office: "Office" };

/** Plain GET form: the URL is the state. */
export function JobFilters({ filters, techs, tags }: { filters: JobFilters; techs: TechOption[]; tags: string[] }) {
  const f = filters;
  const active = Boolean(f.statusParam || f.tech || f.tag || f.source || f.q || !f.defaultRange);
  return (
    <form method="get" action="/jobs" className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 text-sm">
      <Field label="Search">
        <Input name="q" defaultValue={f.q ?? ""} placeholder="Customer, street, invoice #…" className="w-56" />
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={f.statusParam} className={selectCls}>
          <option value="">Any status</option>
          <option value="open">Open (scheduled, in progress, needs scheduling, pending)</option>
          {WORK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
              {s === "complete rated" ? " (rated)" : s === "complete unrated" ? " (unrated)" : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tech">
        <select name="tech" defaultValue={f.tech ?? ""} className={selectCls}>
          <option value="">Any tech</option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="From">
        <Input type="date" name="from" defaultValue={f.from ?? ""} className="w-38" />
      </Field>
      <Field label="To">
        <Input type="date" name="to" defaultValue={f.to ?? ""} className="w-38" />
      </Field>
      <Field label="Tag">
        <select name="tag" defaultValue={f.tag ?? ""} className={`${selectCls} max-w-48`}>
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Source">
        <select name="source" defaultValue={f.source ?? ""} className={selectCls}>
          <option value="">Any source</option>
          {JOB_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-center gap-2 pb-px">
        <Button type="submit" size="sm">
          Apply
        </Button>
        {f.from || f.to ? (
          <Link href={`/jobs${filtersToQuery(f, { from: null, to: null, dates: "all" })}`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            All dates
          </Link>
        ) : (
          <Link href={`/jobs${filtersToQuery(f, { dates: null })}`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Next 2 weeks
          </Link>
        )}
        {active ? (
          <Link href="/jobs" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
