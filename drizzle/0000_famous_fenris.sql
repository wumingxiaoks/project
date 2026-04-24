CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('replicate', 'kling', 'minimax');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"s3_key" text NOT NULL,
	"url" text NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "provider" NOT NULL,
	"model" text NOT NULL,
	"mode" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"prompt" text,
	"negative_prompt" text,
	"input_image_asset_id" text,
	"input_video_asset_id" text,
	"input_audio_asset_id" text,
	"output_asset_id" text,
	"params" jsonb DEFAULT '{}'::jsonb,
	"provider_task_id" text,
	"provider_raw" jsonb,
	"error" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_kind_idx" ON "assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_provider_idx" ON "jobs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_created_at_idx" ON "jobs" USING btree ("created_at" DESC);