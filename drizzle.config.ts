import { defineConfig } from "drizzle-kit";

// We generate SQL migrations from the Drizzle schema, then apply them to D1
// with `wrangler d1 migrations apply` (see package.json scripts). D1 is SQLite.
export default defineConfig({
	schema: "./app/db/schema.ts",
	out: "./drizzle/migrations",
	dialect: "sqlite",
});
