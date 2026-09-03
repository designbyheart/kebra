CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq" START WITH 1 INCREMENT BY 1;
--> statement-breakpoint
SELECT setval('public.invoice_number_seq', (SELECT coalesce(max(invoice_number::int), 0) + 1 FROM jobs WHERE invoice_number ~ '^[0-9]+$'), false);
