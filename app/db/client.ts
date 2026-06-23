import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { invoiceLines } from "./schema";

/** Build a Drizzle client bound to the request's D1 database. */
export function getDb(env: Env) {
	return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;

// D1 rejects any single query with more than 100 bound parameters. A bulk
// insert binds (columns × rows) parameters, so a multi-part vendor invoice that
// parses into enough lines overflows this cap and throws — which is why parsing
// several files at once failed while a single file worked. Insert in chunks
// sized so (columns × rows) stays under the limit.
const D1_MAX_BOUND_PARAMS = 100;

/** Bulk-insert invoice lines, chunked to stay under D1's bound-parameter cap. */
export async function insertInvoiceLines(
	db: Db,
	rows: (typeof invoiceLines.$inferInsert)[],
): Promise<void> {
	if (rows.length === 0) return;
	const cols = Math.max(1, Object.keys(rows[0]).length);
	const perChunk = Math.max(1, Math.floor(D1_MAX_BOUND_PARAMS / cols));
	for (let i = 0; i < rows.length; i += perChunk) {
		await db.insert(invoiceLines).values(rows.slice(i, i + perChunk));
	}
}
