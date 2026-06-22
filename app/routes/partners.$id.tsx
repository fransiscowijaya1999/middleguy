import { eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { getDb } from "~/db/client";
import { partners } from "~/db/schema";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/partners.$id";

export function meta(_: Route.MetaArgs) {
	return [{ title: "Edit partner · middleguy" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	const id = Number(params.id);
	const [partner] = await db
		.select()
		.from(partners)
		.where(eq(partners.id, id))
		.limit(1);
	if (!partner) throw new Response("Not found", { status: 404 });
	return { partner };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const db = getDb(context.cloudflare.env);
	const id = Number(params.id);
	const form = await request.formData();

	if (form.get("intent") === "delete") {
		await db.delete(partners).where(eq(partners.id, id));
		return redirect("/partners");
	}

	const name = String(form.get("name") ?? "").trim();
	if (!name) return { error: "Partner name is required." };
	await db
		.update(partners)
		.set({
			name,
			phone: String(form.get("phone") ?? "").trim(),
			email: String(form.get("email") ?? "").trim(),
		})
		.where(eq(partners.id, id));
	return redirect("/partners");
}

export default function EditPartner({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const p = loaderData.partner;
	return (
		<div className="max-w-xl">
			<Link to="/partners" className={ui.link}>
				← Partners
			</Link>
			<h1 className={`${ui.pageTitle} mt-2`}>Edit partner</h1>

			{actionData?.error && (
				<div className={`${ui.error} mt-4`}>{actionData.error}</div>
			)}

			<Form method="post" className="mt-6 space-y-4">
				<div>
					<label className={ui.label} htmlFor="name">
						Name
					</label>
					<input id="name" name="name" defaultValue={p.name} className={ui.input} />
				</div>
				<div>
					<label className={ui.label} htmlFor="phone">
						Phone
					</label>
					<input id="phone" name="phone" defaultValue={p.phone} className={ui.input} />
				</div>
				<div>
					<label className={ui.label} htmlFor="email">
						Email
					</label>
					<input id="email" name="email" defaultValue={p.email} className={ui.input} />
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
						if (!confirm("Delete this partner?")) e.preventDefault();
					}}
				>
					Delete partner
				</button>
			</Form>
		</div>
	);
}
