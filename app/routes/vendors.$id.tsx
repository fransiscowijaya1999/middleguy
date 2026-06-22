import { eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { getDb } from "~/db/client";
import { vendors } from "~/db/schema";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/vendors.$id";

export function meta(_: Route.MetaArgs) {
	return [{ title: "Edit vendor · middleguy" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	const id = Number(params.id);
	const [vendor] = await db
		.select()
		.from(vendors)
		.where(eq(vendors.id, id))
		.limit(1);
	if (!vendor) throw new Response("Not found", { status: 404 });
	return { vendor };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const db = getDb(context.cloudflare.env);
	const id = Number(params.id);
	const form = await request.formData();

	if (form.get("intent") === "delete") {
		await db.delete(vendors).where(eq(vendors.id, id));
		return redirect("/vendors");
	}

	const name = String(form.get("name") ?? "").trim();
	if (!name) return { error: "Vendor name is required." };
	await db
		.update(vendors)
		.set({
			name,
			phone: String(form.get("phone") ?? "").trim(),
			email: String(form.get("email") ?? "").trim(),
			notes: String(form.get("notes") ?? "").trim(),
		})
		.where(eq(vendors.id, id));
	return redirect("/vendors");
}

export default function EditVendor({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const v = loaderData.vendor;
	return (
		<div className="max-w-xl">
			<Link to="/vendors" className={ui.link}>
				← Vendors
			</Link>
			<h1 className={`${ui.pageTitle} mt-2`}>Edit vendor</h1>

			{actionData?.error && (
				<div className={`${ui.error} mt-4`}>{actionData.error}</div>
			)}

			<Form method="post" className="mt-6 space-y-4">
				<div>
					<label className={ui.label} htmlFor="name">
						Name
					</label>
					<input id="name" name="name" defaultValue={v.name} className={ui.input} />
				</div>
				<div>
					<label className={ui.label} htmlFor="phone">
						Phone
					</label>
					<input id="phone" name="phone" defaultValue={v.phone} className={ui.input} />
				</div>
				<div>
					<label className={ui.label} htmlFor="email">
						Email
					</label>
					<input id="email" name="email" defaultValue={v.email} className={ui.input} />
				</div>
				<div>
					<label className={ui.label} htmlFor="notes">
						Notes
					</label>
					<textarea
						id="notes"
						name="notes"
						rows={3}
						defaultValue={v.notes}
						className={ui.input}
					/>
				</div>
				<button type="submit" className={ui.btnPrimary}>
					Save
				</button>
			</Form>

			<Form method="post" className="mt-8 border-t border-gray-200 pt-4">
				<input type="hidden" name="intent" value="delete" />
				<button
					type="submit"
					className={ui.btnDanger}
					onClick={(e) => {
						if (!confirm("Delete this vendor?")) e.preventDefault();
					}}
				>
					Delete vendor
				</button>
			</Form>
		</div>
	);
}
