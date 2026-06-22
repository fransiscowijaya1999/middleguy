import { asc } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { getDb } from "~/db/client";
import { partners } from "~/db/schema";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/partners";

export function meta(_: Route.MetaArgs) {
	return [{ title: "Partners · middleguy" }];
}

export async function loader({ context }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	return {
		partners: await db.select().from(partners).orderBy(asc(partners.name)),
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const db = getDb(context.cloudflare.env);
	const form = await request.formData();
	const name = String(form.get("name") ?? "").trim();
	if (!name) return { error: "Partner name is required." };
	await db.insert(partners).values({
		name,
		phone: String(form.get("phone") ?? "").trim(),
		email: String(form.get("email") ?? "").trim(),
	});
	return redirect("/partners");
}

export default function Partners({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	return (
		<div className="max-w-3xl">
			<h1 className={ui.pageTitle}>Partners</h1>
			<p className="mt-1 text-gray-600">
				The friends/shops you resell to. Used on customer-facing invoices.
			</p>

			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">Add a partner</h2>
				{actionData?.error && (
					<div className={`${ui.error} mt-2`}>{actionData.error}</div>
				)}
				<Form method="post" className="mt-3 grid gap-3 sm:grid-cols-3">
					<input name="name" placeholder="Name" className={ui.inputSm} />
					<input name="phone" placeholder="Phone" className={ui.inputSm} />
					<input name="email" placeholder="Email" className={ui.inputSm} />
					<div className="sm:col-span-3">
						<button type="submit" className={ui.btnPrimary}>
							Add partner
						</button>
					</div>
				</Form>
			</div>

			<table className={`${ui.table} mt-6`}>
				<thead>
					<tr>
						<th className={ui.th}>Name</th>
						<th className={ui.th}>Phone</th>
						<th className={ui.th}>Email</th>
						<th className={ui.th} />
					</tr>
				</thead>
				<tbody>
					{loaderData.partners.length === 0 && (
						<tr>
							<td className={`${ui.td} text-gray-500`} colSpan={4}>
								No partners yet.
							</td>
						</tr>
					)}
					{loaderData.partners.map((p) => (
						<tr key={p.id}>
							<td className={ui.td}>{p.name}</td>
							<td className={ui.td}>{p.phone}</td>
							<td className={ui.td}>{p.email}</td>
							<td className={`${ui.td} text-right`}>
								<Link to={`/partners/${p.id}`} className={ui.link}>
									Edit
								</Link>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
