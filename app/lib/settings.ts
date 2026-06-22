import { eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { type Settings, settings } from "~/db/schema";

const SETTINGS_ID = 1;

/** Read the single settings row, creating it with defaults on first use. */
export async function getSettings(db: Db): Promise<Settings> {
	const rows = await db
		.select()
		.from(settings)
		.where(eq(settings.id, SETTINGS_ID))
		.limit(1);
	if (rows.length > 0) return rows[0];
	const [created] = await db
		.insert(settings)
		.values({ id: SETTINGS_ID })
		.returning();
	return created;
}
