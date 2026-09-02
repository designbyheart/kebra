import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const workStatusEnum = pgEnum("work_status", [
  "scheduled",
  "in progress",
  "complete rated",
  "complete unrated",
  "needs scheduling",
  "user canceled",
  "pro canceled",
  "pending_cancellation",
]);
export const jobSourceEnum = pgEnum("job_source", ["import", "agent", "office"]);
export const jobPriorityEnum = pgEnum("job_priority", ["normal", "high", "emergency"]);
export const noteAuthorEnum = pgEnum("note_author_type", ["tech", "office", "agent", "system"]);
export const phoneSourceEnum = pgEnum("phone_source", ["agent", "office", "import"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "office", "tech"]);
export const actorEnum = pgEnum("actor", ["agent", "office", "system"]);
export const callDirectionEnum = pgEnum("call_direction", ["inbound", "outbound", "web"]);
export const callStatusEnum = pgEnum("call_status", [
  "ringing",
  "in_progress",
  "forwarding",
  "ended",
  "failed",
]);
export const taskKindEnum = pgEnum("task_kind", [
  "callback",
  "handoff",
  "review",
  "followup",
  "cancellation",
]);
export const taskStatusEnum = pgEnum("task_status", ["open", "in_progress", "done", "dismissed"]);
export const changeRequestKindEnum = pgEnum("change_request_kind", ["cancel"]);
export const changeRequestStatusEnum = pgEnum("change_request_status", [
  "pending",
  "approved",
  "rejected",
]);

// Shared column helpers
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---------------------------------------------------------------------------
// Core (imported 1:1 from the JSONL)
// ---------------------------------------------------------------------------

export const customers = pgTable("customers", {
  id: text("id").primaryKey(), // cus_...
  firstName: text("first_name"),
  lastName: text("last_name"),
  company: text("company"),
  kind: text("kind"), // homeowner | business | ...
  displayName: text("display_name").notNull(),
  phone: text("phone"), // e164, nullable (source data has none)
  jobCount: integer("job_count").notNull().default(0),
  firstJob: ts("first_job"),
  lastJob: ts("last_job"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const addresses = pgTable(
  "addresses",
  {
    id: text("id").primaryKey(), // adr_...
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    street: text("street").notNull(),
    unit: text("unit"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    normalizedStreet: text("normalized_street"),
    // street + unit + city + zip, lowercased; GIN trigram index added by
    // hand in the migration (drizzle-kit does not emit gin_trgm_ops).
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("addresses_customer_idx").on(t.customerId),
    index("addresses_zip_idx").on(t.zip),
  ],
);

export const employees = pgTable("employees", {
  id: text("id").primaryKey(), // pro_...
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role").notNull(), // field tech | office | admin | ...
  jobs: integer("jobs").notNull().default(0),
  active: boolean("active").notNull().default(true),
  phone: text("phone"),
  createdAt: createdAt(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(), // job_...
    invoiceNumber: text("invoice_number"),
    description: text("description"),
    workStatus: workStatusEnum("work_status").notNull().default("needs scheduling"),
    scheduledStart: ts("scheduled_start"),
    scheduledEnd: ts("scheduled_end"),
    arrivalWindow: integer("arrival_window"), // minutes
    onMyWayAt: ts("on_my_way_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    leadSource: text("lead_source"),
    totalAmount: integer("total_amount").notNull().default(0), // cents
    outstandingBalance: integer("outstanding_balance").notNull().default(0), // cents
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    addressId: text("address_id").references(() => addresses.id),
    source: jobSourceEnum("source").notNull().default("import"),
    priority: jobPriorityEnum("priority").notNull().default("normal"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    canceledAt: ts("canceled_at"),
  },
  (t) => [
    index("jobs_customer_idx").on(t.customerId),
    index("jobs_address_idx").on(t.addressId),
    index("jobs_scheduled_start_idx").on(t.scheduledStart),
    index("jobs_work_status_idx").on(t.workStatus),
  ],
);

export const jobAssignments = pgTable(
  "job_assignments",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.employeeId] }),
    index("job_assignments_employee_idx").on(t.employeeId),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(), // nte_...
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    authorType: noteAuthorEnum("author_type").notNull().default("tech"),
    authorId: text("author_id"), // employee/user id when known
    createdAt: createdAt(),
    seq: integer("seq").notNull().default(0), // original order within the job
  },
  (t) => [index("notes_job_idx").on(t.jobId, t.seq)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(), // invoice_...
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number"),
    status: text("status"), // open | paid | ...
    amount: integer("amount").notNull().default(0), // cents
    subtotal: integer("subtotal").notNull().default(0),
    dueAmount: integer("due_amount").notNull().default(0),
    paidAt: ts("paid_at"),
    sentAt: ts("sent_at"),
    serviceDate: ts("service_date"),
    invoiceDate: ts("invoice_date"),
  },
  (t) => [index("invoices_job_idx").on(t.jobId)],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: text("id").primaryKey(), // invitm_...
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type"), // labor | material | ...
    unitPrice: integer("unit_price").notNull().default(0), // cents
    qtyInHundredths: integer("qty_in_hundredths").notNull().default(100),
    amount: integer("amount").notNull().default(0), // cents
    seq: integer("seq").notNull().default(0),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const customerPhones = pgTable(
  "customer_phones",
  {
    id: text("id").primaryKey(), // phn_...
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(), // e164
    label: text("label"), // mobile | home | work | ...
    source: phoneSourceEnum("source").notNull().default("agent"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_phones_customer_phone_uq").on(t.customerId, t.phone),
    index("customer_phones_phone_idx").on(t.phone),
  ],
);

// ---------------------------------------------------------------------------
// Derived / platform
// ---------------------------------------------------------------------------

export const addressDossiers = pgTable("address_dossiers", {
  addressId: text("address_id")
    .primaryKey()
    .references(() => addresses.id, { onDelete: "cascade" }),
  summaryMd: text("summary_md"),
  lastVisitAt: ts("last_visit_at"),
  lastVisitSummary: text("last_visit_summary"),
  equipment: jsonb("equipment").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  warranty: jsonb("warranty").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  openIssues: jsonb("open_issues").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  accessNotes: text("access_notes"),
  recurringIssues: jsonb("recurring_issues").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  generatedAt: ts("generated_at"),
  model: text("model"),
});

export const customerDossiers = pgTable("customer_dossiers", {
  customerId: text("customer_id")
    .primaryKey()
    .references(() => customers.id, { onDelete: "cascade" }),
  summaryMd: text("summary_md"),
  sitesCount: integer("sites_count").notNull().default(0),
  openBalance: integer("open_balance").notNull().default(0), // cents
  preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  generatedAt: ts("generated_at"),
  model: text("model"),
});

export type TranscriptTurn = { role: "assistant" | "user" | "system" | "tool"; text: string; t: number };
export type ToolCallRecord = {
  id?: string;
  name: string;
  args: unknown;
  result?: unknown;
  ok?: boolean;
  t: number;
  durationMs?: number;
};
export type Promise_ = { text: string; kind?: string; dueAt?: string; taskId?: string };

export const calls = pgTable(
  "calls",
  {
    id: text("id").primaryKey(), // call_...
    providerCallId: text("provider_call_id"),
    direction: callDirectionEnum("direction").notNull().default("inbound"),
    startedAt: ts("started_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
    callerNumber: text("caller_number"),
    matchedCustomerId: text("matched_customer_id").references(() => customers.id),
    matchedAddressId: text("matched_address_id").references(() => addresses.id),
    status: callStatusEnum("status").notNull().default("in_progress"),
    transcript: jsonb("transcript").$type<TranscriptTurn[]>().notNull().default(sql`'[]'::jsonb`),
    toolCalls: jsonb("tool_calls").$type<ToolCallRecord[]>().notNull().default(sql`'[]'::jsonb`),
    summary: text("summary"),
    outcome: text("outcome"), // booked | rescheduled | canceled | info | handoff | voicemail | ...
    promises: jsonb("promises").$type<Promise_[]>().notNull().default(sql`'[]'::jsonb`),
    handoffReason: text("handoff_reason"),
    recordingUrl: text("recording_url"),
    needsReview: boolean("needs_review").notNull().default(false),
    endedReason: text("ended_reason"),
    costCents: integer("cost_cents"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex("calls_provider_call_id_uq").on(t.providerCallId),
    index("calls_started_at_idx").on(t.startedAt),
    index("calls_matched_customer_idx").on(t.matchedCustomerId),
  ],
);

export const events = pgTable(
  "events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ts: ts("ts").notNull().defaultNow(),
    actor: actorEnum("actor").notNull(),
    actorId: text("actor_id"), // user id / "vapi" / null
    callId: text("call_id").references(() => calls.id, { onDelete: "set null" }),
    type: text("type").notNull(), // job.created, job.rescheduled, note.added, ...
    entityType: text("entity_type").notNull(), // job | customer | call | task | ...
    entityId: text("entity_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("events_ts_idx").on(t.ts.desc()),
    index("events_call_idx").on(t.callId),
    index("events_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(), // tsk_...
    kind: taskKindEnum("kind").notNull(),
    status: taskStatusEnum("status").notNull().default("open"),
    title: text("title").notNull(),
    body: text("body"),
    customerId: text("customer_id").references(() => customers.id),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    callId: text("call_id").references(() => calls.id, { onDelete: "set null" }),
    dueAt: ts("due_at"),
    assignedTo: text("assigned_to"), // users.id
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("tasks_status_idx").on(t.status, t.dueAt), index("tasks_call_idx").on(t.callId)],
);

export const changeRequests = pgTable(
  "change_requests",
  {
    id: text("id").primaryKey(), // chg_...
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: changeRequestKindEnum("kind").notNull().default("cancel"),
    status: changeRequestStatusEnum("status").notNull().default("pending"),
    reason: text("reason"),
    callId: text("call_id").references(() => calls.id, { onDelete: "set null" }),
    // message index range in calls.transcript, e.g. { from: 12, to: 18 }
    transcriptRef: jsonb("transcript_ref").$type<{ from: number; to: number }>(),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
    resolvedBy: text("resolved_by"), // users.id
    resolutionNote: text("resolution_note"),
  },
  (t) => [index("change_requests_job_idx").on(t.jobId), index("change_requests_status_idx").on(t.status)],
);

export const users = pgTable("users", {
  id: text("id").primaryKey(), // usr_...
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("office"),
  passwordHash: text("password_hash").notNull(),
  employeeId: text("employee_id").references(() => employees.id),
  createdAt: createdAt(),
  lastLoginAt: ts("last_login_at"),
});

export const serviceTypes = pgTable("service_types", {
  id: text("id").primaryKey(), // slug: diagnostic | repair | ...
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
});

export const businessHours = pgTable("business_hours", {
  dow: integer("dow").primaryKey(), // 0 = Sunday ... 6 = Saturday
  open: text("open"), // "08:00" local, null = closed
  close: text("close"), // "18:00" local
  closed: boolean("closed").notNull().default(false),
  tz: text("tz").notNull().default("America/New_York"),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const customersRelations = relations(customers, ({ many, one }) => ({
  addresses: many(addresses),
  jobs: many(jobs),
  phones: many(customerPhones),
  dossier: one(customerDossiers, { fields: [customers.id], references: [customerDossiers.customerId] }),
}));

export const addressesRelations = relations(addresses, ({ one, many }) => ({
  customer: one(customers, { fields: [addresses.customerId], references: [customers.id] }),
  jobs: many(jobs),
  dossier: one(addressDossiers, { fields: [addresses.id], references: [addressDossiers.addressId] }),
}));

export const employeesRelations = relations(employees, ({ many }) => ({
  assignments: many(jobAssignments),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  customer: one(customers, { fields: [jobs.customerId], references: [customers.id] }),
  address: one(addresses, { fields: [jobs.addressId], references: [addresses.id] }),
  assignments: many(jobAssignments),
  notes: many(notes),
  invoices: many(invoices),
  changeRequests: many(changeRequests),
  tasks: many(tasks),
}));

export const jobAssignmentsRelations = relations(jobAssignments, ({ one }) => ({
  job: one(jobs, { fields: [jobAssignments.jobId], references: [jobs.id] }),
  employee: one(employees, { fields: [jobAssignments.employeeId], references: [employees.id] }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  job: one(jobs, { fields: [notes.jobId], references: [jobs.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  job: one(jobs, { fields: [invoices.jobId], references: [jobs.id] }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const customerPhonesRelations = relations(customerPhones, ({ one }) => ({
  customer: one(customers, { fields: [customerPhones.customerId], references: [customers.id] }),
}));

export const callsRelations = relations(calls, ({ one, many }) => ({
  customer: one(customers, { fields: [calls.matchedCustomerId], references: [customers.id] }),
  address: one(addresses, { fields: [calls.matchedAddressId], references: [addresses.id] }),
  events: many(events),
  tasks: many(tasks),
  changeRequests: many(changeRequests),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  call: one(calls, { fields: [events.callId], references: [calls.id] }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  job: one(jobs, { fields: [tasks.jobId], references: [jobs.id] }),
  call: one(calls, { fields: [tasks.callId], references: [calls.id] }),
  customer: one(customers, { fields: [tasks.customerId], references: [customers.id] }),
}));

export const changeRequestsRelations = relations(changeRequests, ({ one }) => ({
  job: one(jobs, { fields: [changeRequests.jobId], references: [jobs.id] }),
  call: one(calls, { fields: [changeRequests.callId], references: [calls.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  employee: one(employees, { fields: [users.employeeId], references: [employees.id] }),
}));

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type Customer = typeof customers.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type ChangeRequest = typeof changeRequests.$inferSelect;
export type User = typeof users.$inferSelect;
export type ServiceType = typeof serviceTypes.$inferSelect;
export type BusinessHoursRow = typeof businessHours.$inferSelect;
