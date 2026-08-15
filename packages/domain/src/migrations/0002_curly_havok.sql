ALTER TABLE "airport" ADD COLUMN "country" char(2);--> statement-breakpoint
-- Backfill do acervo já gravado: nesta feature todo o acervo é brasileiro. O
-- `WHERE ... IS NULL` mantém o comando reexecutável; daí em diante quem preenche
-- é `saveAirportWith`, a cada coleta.
UPDATE "airport" SET "country" = 'BR' WHERE "country" IS NULL;--> statement-breakpoint
CREATE INDEX "airport_country_idx" ON "airport" USING btree ("country");