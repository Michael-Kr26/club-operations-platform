CREATE TABLE "report_workbooks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"dataset" text NOT NULL,
	"location_id" text,
	"filename" text NOT NULL,
	"hash" text NOT NULL,
	"original" "bytea" NOT NULL,
	"report" jsonb,
	"status" text NOT NULL,
	"error" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" text NOT NULL,
	CONSTRAINT "report_workbook_dataset" CHECK ("report_workbooks"."dataset" IN ('real','demo')),
	CONSTRAINT "report_workbook_status" CHECK ("report_workbooks"."status" IN ('accepted','rejected'))
);
--> statement-breakpoint
ALTER TABLE "report_workbooks" ADD CONSTRAINT "report_workbooks_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_workbook_unique" ON "report_workbooks" USING btree ("organization_id","dataset","hash");--> statement-breakpoint
CREATE INDEX "report_workbook_scope" ON "report_workbooks" USING btree ("organization_id","dataset","location_id");