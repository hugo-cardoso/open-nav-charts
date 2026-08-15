CREATE TABLE "airport" (
	"icao" char(4) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" char(2),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airport_procedure" (
	"id" text PRIMARY KEY NOT NULL,
	"airport_icao" char(4) NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"amendment" text,
	"source_url" text,
	"storage_key" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airport_runway" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airport_icao" char(4) NOT NULL,
	"ident" text NOT NULL,
	"length_m" integer,
	"width_m" integer
);
--> statement-breakpoint
ALTER TABLE "airport_procedure" ADD CONSTRAINT "airport_procedure_airport_icao_airport_icao_fk" FOREIGN KEY ("airport_icao") REFERENCES "public"."airport"("icao") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_runway" ADD CONSTRAINT "airport_runway_airport_icao_airport_icao_fk" FOREIGN KEY ("airport_icao") REFERENCES "public"."airport"("icao") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airport_state_idx" ON "airport" USING btree ("state");--> statement-breakpoint
CREATE INDEX "airport_procedure_icao_idx" ON "airport_procedure" USING btree ("airport_icao");--> statement-breakpoint
CREATE UNIQUE INDEX "airport_runway_icao_ident_uq" ON "airport_runway" USING btree ("airport_icao","ident");--> statement-breakpoint
CREATE INDEX "airport_runway_icao_idx" ON "airport_runway" USING btree ("airport_icao");