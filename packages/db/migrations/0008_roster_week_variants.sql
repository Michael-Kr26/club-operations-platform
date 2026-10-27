DROP INDEX "roster_template_location";--> statement-breakpoint
ALTER TABLE "operation_roster_templates" ADD COLUMN "slot" text DEFAULT 'A' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "roster_template_location_slot" ON "operation_roster_templates" USING btree ("organization_id","dataset","location_id","slot");--> statement-breakpoint
ALTER TABLE "operation_roster_templates" ADD CONSTRAINT "roster_template_slot" CHECK ("operation_roster_templates"."slot" IN ('A','B'));