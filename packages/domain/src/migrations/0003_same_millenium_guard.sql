CREATE TABLE "source_sync_state" (
	"source" text PRIMARY KEY NOT NULL,
	"last_update" text,
	"airac_cycle" text,
	"observed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "airport" ADD COLUMN "runways_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "airport" ADD COLUMN "source_updated_on" text;