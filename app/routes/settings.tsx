import { eq } from "drizzle-orm";
import { Form, useNavigation } from "react-router";
import { getDb } from "~/db/client";
import { settings as settingsTable } from "~/db/schema";
import { getSettings } from "~/lib/settings";
import type { Route } from "./+types/settings";

export function meta(_: Route.MetaArgs) {
	return [{ title: "Settings · middleguy" }];
}

export async function loader({ context }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	return { settings: await getSettings(db) };
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	const db = getDb(env);
	const current = await getSettings(db);
	const form = await request.formData();

	const businessName = String(form.get("businessName") ?? "").trim() || "middleguy";
	const address = String(form.get("address") ?? "").trim();
	const contact = String(form.get("contact") ?? "").trim();
	const markupRaw = Number(form.get("defaultMarkupPercent"));
	const defaultMarkupPercent = Number.isFinite(markupRaw) ? markupRaw : 0;

	let logoKey = current.logoKey;
	const logo = form.get("logo");
	if (logo instanceof File && logo.size > 0) {
		const safeName = logo.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
		logoKey = `logos/${Date.now()}-${safeName}`;
		await env.FILES.put(logoKey, await logo.arrayBuffer(), {
			httpMetadata: { contentType: logo.type || "application/octet-stream" },
		});
		if (current.logoKey && current.logoKey !== logoKey) {
			await env.FILES.delete(current.logoKey);
		}
	}

	await db
		.update(settingsTable)
		.set({ businessName, address, contact, defaultMarkupPercent, logoKey, updatedAt: new Date() })
		.where(eq(settingsTable.id, current.id));

	return { ok: true as const };
}

const fieldClass =
	"mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";
const labelClass = "block text-sm font-medium text-gray-700";

export default function SettingsPage({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const s = loaderData.settings;
	const nav = useNavigation();
	const saving = nav.state === "submitting";

	return (
		<div className="max-w-2xl">
			<h1 className="text-2xl font-bold">Settings</h1>
			<p className="mt-1 text-gray-600">
				These appear on your customer-facing invoices.
			</p>

			{actionData?.ok && (
				<div className="mt-4 rounded-md bg-green-50 px-4 py-2 text-sm text-green-800">
					Saved.
				</div>
			)}

			<Form method="post" encType="multipart/form-data" className="mt-6 space-y-5">
				<div>
					<label className={labelClass} htmlFor="businessName">
						Business name
					</label>
					<input
						id="businessName"
						name="businessName"
						defaultValue={s.businessName}
						className={fieldClass}
					/>
				</div>

				<div>
					<label className={labelClass} htmlFor="address">
						Address
					</label>
					<textarea
						id="address"
						name="address"
						rows={2}
						defaultValue={s.address}
						className={fieldClass}
					/>
				</div>

				<div>
					<label className={labelClass} htmlFor="contact">
						Contact (phone / email)
					</label>
					<input
						id="contact"
						name="contact"
						defaultValue={s.contact}
						className={fieldClass}
					/>
				</div>

				<div>
					<label className={labelClass} htmlFor="defaultMarkupPercent">
						Default markup %
					</label>
					<input
						id="defaultMarkupPercent"
						name="defaultMarkupPercent"
						type="number"
						step="0.01"
						min="0"
						defaultValue={s.defaultMarkupPercent}
						className={fieldClass}
					/>
					<p className="mt-1 text-xs text-gray-500">
						Applied to new invoices; you can override per invoice.
					</p>
				</div>

				<div>
					<label className={labelClass} htmlFor="logo">
						Logo
					</label>
					{s.logoKey && (
						<img
							src={`/files/${s.logoKey}`}
							alt="Current logo"
							className="mt-2 h-16 w-auto rounded border border-gray-200 bg-white object-contain p-1"
						/>
					)}
					<input
						id="logo"
						name="logo"
						type="file"
						accept="image/*"
						className="mt-2 block text-sm"
					/>
				</div>

				<button
					type="submit"
					disabled={saving}
					className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
				>
					{saving ? "Saving…" : "Save settings"}
				</button>
			</Form>
		</div>
	);
}
