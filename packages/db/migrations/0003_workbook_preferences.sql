CREATE TABLE "report_workbook_preferences" (
	"organization_id" text NOT NULL,
	"dataset" text NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "report_workbook_preferences_organization_id_dataset_pk" PRIMARY KEY("organization_id","dataset"),
	CONSTRAINT "workbook_preferences_dataset" CHECK ("report_workbook_preferences"."dataset" IN ('real','demo'))
);
--> statement-breakpoint
ALTER TABLE "report_workbook_preferences" ADD CONSTRAINT "report_workbook_preferences_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;