CREATE TABLE "operation_roster_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"dataset" text NOT NULL,
	"location_id" text NOT NULL,
	"source_week" text NOT NULL,
	"entries" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "roster_template_dataset" CHECK ("operation_roster_templates"."dataset" IN ('real','demo'))
);
--> statement-breakpoint
ALTER TABLE "operation_roster_templates" ADD CONSTRAINT "operation_roster_templates_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roster_template_location" ON "operation_roster_templates" USING btree ("organization_id","dataset","location_id");