import type { JobRow as JobListRow } from "@/app/jobs/queries";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/atoms/ui/table";
import { JobRow } from "@/components/molecules/job-row";

export type JobsTableProps = { rows: JobListRow[]; emptyText?: string };

/** The /jobs result table, or a dashed empty note. */
export function JobsTable({ rows, emptyText = "No jobs match these filters." }: JobsTableProps) {
  if (rows.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[190px]">Window</TableHead>
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Tech</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead className="text-right">Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <JobRow key={r.id} row={r} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
