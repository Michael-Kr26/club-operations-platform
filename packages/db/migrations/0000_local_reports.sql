CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_access" (
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"locations" jsonb,
	CONSTRAINT "report_access_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "report_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"dataset" text NOT NULL,
	"source" text NOT NULL,
	"hash" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"filename" text NOT NULL,
	"original" "bytea" NOT NULL,
	"rows" jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" text NOT NULL,
	CONSTRAINT "report_import_dataset" CHECK ("report_imports"."dataset" IN ('real','demo')),
	CONSTRAINT "report_import_status" CHECK ("report_imports"."status" IN ('accepted','rejected'))
);
--> statement-breakpoint
CREATE TABLE "report_organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"definition" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"dataset" text NOT NULL,
	"kind" text NOT NULL,
	"report_date" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"reason" text,
	"preview" jsonb,
	"created_by" text NOT NULL,
	CONSTRAINT "report_run_dataset" CHECK ("report_runs"."dataset" IN ('real','demo')),
	CONSTRAINT "report_run_kind" CHECK ("report_runs"."kind" IN ('daily','monthly')),
	CONSTRAINT "report_run_status" CHECK ("report_runs"."status" IN ('claimed','captured','missed','blocked','uncertain'))
);
--> statement-breakpoint
CREATE TABLE "report_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone DEFAULT now() NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_access" ADD CONSTRAINT "report_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_access" ADD CONSTRAINT "report_access_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit" ADD CONSTRAINT "report_audit_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_imports" ADD CONSTRAINT "report_imports_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_settings" ADD CONSTRAINT "report_settings_organization_id_report_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."report_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_import_unique" ON "report_imports" USING btree ("organization_id","dataset","source","hash");--> statement-breakpoint
CREATE INDEX "report_import_scope" ON "report_imports" USING btree ("organization_id","dataset","imported_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_run_unique" ON "report_runs" USING btree ("organization_id","dataset","kind","report_date");