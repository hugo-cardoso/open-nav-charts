import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/drizzle/schema.ts",
  out: "./src/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://onc:onc@localhost:5432/onc",
  },
});
