CREATE TABLE "operation_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"dataset" text NOT NULL,
	"location_id" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"source_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "operation_dataset" CHECK ("operation_records"."dataset" IN ('real','demo')),
	CONSTRAINT "operation_kind" CHECK ("operation_records"."kind" IN ('task','employee','shift','checklist','asset','contact'))
);
--> statement-breakpoint
ALTER TABLE "operation_records" ADD CONSTRAINT "operation_records_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operation_scope" ON "operation_records" USING btree ("organization_id","dataset","location_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_source_unique" ON "operation_records" USING btree ("organization_id","dataset","kind","source_key");
--> statement-breakpoint
UPDATE report_access SET permissions=(SELECT jsonb_agg(DISTINCT value) FROM jsonb_array_elements(permissions || '["operations.read","operations.manage","members.read"]'::jsonb)) WHERE permissions ? 'reports.manage';
