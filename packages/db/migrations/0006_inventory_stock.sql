CREATE TABLE "inventory_stock" (
	"organization_id" text NOT NULL,
	"dataset" text NOT NULL,
	"items" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "inventory_stock_organization_id_dataset_pk" PRIMARY KEY("organization_id","dataset"),
	CONSTRAINT "inventory_dataset" CHECK ("inventory_stock"."dataset" IN ('real','demo'))
);
--> statement-breakpoint
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;