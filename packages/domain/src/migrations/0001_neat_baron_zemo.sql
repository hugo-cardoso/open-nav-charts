ALTER TABLE "airport" ADD COLUMN "search_text" text;--> statement-breakpoint
-- Backfill do acervo já gravado. A normalização em SQL espelha `normalizeSearchText`
-- do pacote domain e só corre aqui; daí em diante quem preenche é `saveAirportWith`.
UPDATE "airport" SET "search_text" = translate(
  lower("icao" || ' ' || "name" || ' ' || coalesce("city", '')),
  'áàâãäéèêëíìîïóòôõöúùûüçñ',
  'aaaaaeeeeiiiiooooouuuucn'
);--> statement-breakpoint
CREATE INDEX "airport_search_text_idx" ON "airport" USING btree ("search_text" text_pattern_ops);
