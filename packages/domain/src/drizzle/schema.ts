import {
  char,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const airport = pgTable(
  "airport",
  {
    icao: char("icao", { length: 4 }).primaryKey(),
    name: text("name").notNull(),
    city: text("city"),
    state: char("state", { length: 2 }),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    /**
     * ICAO, nome e cidade concatenados e normalizados, para a busca insensível a
     * caixa e a acentuação. Detalhe de persistência: nunca entra na entidade
     * `Airport` nem é serializado.
     */
    searchText: text("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("airport_state_idx").on(table.state),
    index("airport_search_text_idx").on(table.searchText),
  ],
);

export const airportRunway = pgTable(
  "airport_runway",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    airportIcao: char("airport_icao", { length: 4 })
      .notNull()
      .references(() => airport.icao, { onDelete: "cascade" }),
    ident: text("ident").notNull(),
    lengthM: integer("length_m"),
    widthM: integer("width_m"),
  },
  (table) => [
    uniqueIndex("airport_runway_icao_ident_uq").on(table.airportIcao, table.ident),
    index("airport_runway_icao_idx").on(table.airportIcao),
  ],
);

export const airportProcedure = pgTable(
  "airport_procedure",
  {
    id: text("id").primaryKey(),
    airportIcao: char("airport_icao", { length: 4 })
      .notNull()
      .references(() => airport.icao, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    amendment: text("amendment"),
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("airport_procedure_icao_idx").on(table.airportIcao)],
);
