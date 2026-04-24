CREATE TABLE IF NOT EXISTS "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "provider" NOT NULL,
	"label" text NOT NULL,
	"is_default" text DEFAULT 'false' NOT NULL,
	"secret_encrypted" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_ok" text,
	"last_test_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "credential_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credentials_provider_idx" ON "credentials" USING btree ("provider");