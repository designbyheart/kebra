CREATE TYPE "public"."actor" AS ENUM('agent', 'office', 'system');--> statement-breakpoint
CREATE TYPE "public"."call_direction" AS ENUM('inbound', 'outbound', 'web');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('ringing', 'in_progress', 'forwarding', 'ended', 'failed');--> statement-breakpoint
CREATE TYPE "public"."change_request_kind" AS ENUM('cancel');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."job_priority" AS ENUM('normal', 'high', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('import', 'agent', 'office');--> statement-breakpoint
CREATE TYPE "public"."note_author_type" AS ENUM('tech', 'office', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."phone_source" AS ENUM('agent', 'office', 'import');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('callback', 'handoff', 'review', 'followup', 'cancellation');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'office', 'tech');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('scheduled', 'in progress', 'complete rated', 'complete unrated', 'needs scheduling', 'user canceled', 'pro canceled', 'pending_cancellation');--> statement-breakpoint
CREATE TABLE "address_dossiers" (
	"address_id" text PRIMARY KEY NOT NULL,
	"summary_md" text,
	"last_visit_at" timestamp with time zone,
	"last_visit_summary" text,
	"equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warranty" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"open_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_notes" text,
	"recurring_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"model" text
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"street" text NOT NULL,
	"unit" text,
	"city" text,
	"state" text,
	"zip" text,
	"lat" double precision,
	"lng" double precision,
	"normalized_street" text,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"dow" integer PRIMARY KEY NOT NULL,
	"open" text,
	"close" text,
	"closed" boolean DEFAULT false NOT NULL,
	"tz" text DEFAULT 'America/New_York' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_call_id" text,
	"direction" "call_direction" DEFAULT 'inbound' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"caller_number" text,
	"matched_customer_id" text,
	"matched_address_id" text,
	"status" "call_status" DEFAULT 'in_progress' NOT NULL,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"outcome" text,
	"promises" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"handoff_reason" text,
	"recording_url" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"ended_reason" text,
	"cost_cents" integer,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"kind" "change_request_kind" DEFAULT 'cancel' NOT NULL,
	"status" "change_request_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"call_id" text,
	"transcript_ref" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text
);
--> statement-breakpoint
CREATE TABLE "customer_dossiers" (
	"customer_id" text PRIMARY KEY NOT NULL,
	"summary_md" text,
	"sites_count" integer DEFAULT 0 NOT NULL,
	"open_balance" integer DEFAULT 0 NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"model" text
);
--> statement-breakpoint
CREATE TABLE "customer_phones" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"phone" text NOT NULL,
	"label" text,
	"source" "phone_source" DEFAULT 'agent' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"company" text,
	"kind" text,
	"display_name" text NOT NULL,
	"phone" text,
	"job_count" integer DEFAULT 0 NOT NULL,
	"first_job" timestamp with time zone,
	"last_job" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" text NOT NULL,
	"jobs" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" "actor" NOT NULL,
	"actor_id" text,
	"call_id" text,
	"type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"qty_in_hundredths" integer DEFAULT 100 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"invoice_number" text,
	"status" text,
	"amount" integer DEFAULT 0 NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"due_amount" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"service_date" timestamp with time zone,
	"invoice_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_assignments" (
	"job_id" text NOT NULL,
	"employee_id" text NOT NULL,
	CONSTRAINT "job_assignments_job_id_employee_id_pk" PRIMARY KEY("job_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text,
	"description" text,
	"work_status" "work_status" DEFAULT 'needs scheduling' NOT NULL,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"arrival_window" integer,
	"on_my_way_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"lead_source" text,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"outstanding_balance" integer DEFAULT 0 NOT NULL,
	"customer_id" text NOT NULL,
	"address_id" text,
	"source" "job_source" DEFAULT 'import' NOT NULL,
	"priority" "job_priority" DEFAULT 'normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"content" text NOT NULL,
	"author_type" "note_author_type" DEFAULT 'tech' NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "task_kind" NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"customer_id" text,
	"job_id" text,
	"call_id" text,
	"due_at" timestamp with time zone,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'office' NOT NULL,
	"password_hash" text NOT NULL,
	"employee_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "address_dossiers" ADD CONSTRAINT "address_dossiers_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_matched_customer_id_customers_id_fk" FOREIGN KEY ("matched_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_matched_address_id_addresses_id_fk" FOREIGN KEY ("matched_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_dossiers" ADD CONSTRAINT "customer_dossiers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_phones" ADD CONSTRAINT "customer_phones_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "addresses_zip_idx" ON "addresses" USING btree ("zip");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_provider_call_id_uq" ON "calls" USING btree ("provider_call_id");--> statement-breakpoint
CREATE INDEX "calls_started_at_idx" ON "calls" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "calls_matched_customer_idx" ON "calls" USING btree ("matched_customer_id");--> statement-breakpoint
CREATE INDEX "change_requests_job_idx" ON "change_requests" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "change_requests_status_idx" ON "change_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_phones_customer_phone_uq" ON "customer_phones" USING btree ("customer_id","phone");--> statement-breakpoint
CREATE INDEX "customer_phones_phone_idx" ON "customer_phones" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "events_ts_idx" ON "events" USING btree ("ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_call_idx" ON "events" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_job_idx" ON "invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_assignments_employee_idx" ON "job_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "jobs_customer_idx" ON "jobs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "jobs_address_idx" ON "jobs" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "jobs_scheduled_start_idx" ON "jobs" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "jobs_work_status_idx" ON "jobs" USING btree ("work_status");--> statement-breakpoint
CREATE INDEX "notes_job_idx" ON "notes" USING btree ("job_id","seq");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_call_idx" ON "tasks" USING btree ("call_id");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addresses_search_text_trgm_idx" ON "addresses" USING gin ("search_text" gin_trgm_ops);
