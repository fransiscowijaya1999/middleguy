import { asc } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { getDb } from "~/db/client";
import { vendors } from "~/db/schema";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/vendors";

export function meta(_: Route.MetaArgs) {
	return [{ title: "Vendors · middleguy" }];
}

export async function loader({ context }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	return { vendors: await db.select().from(vendors).orderBy(asc(vendors.name)) };
}

export async function action({ request, context }: Route.ActionArgs) {
	const db = getDb(context.cloudflare.env);
	const form = await request.formData();
	const name = String(form.get("name") ?? "").trim();
	if (!name) return { error: "Vendor name is required." };
	await db.insert(vendors).values({
		name,
		phone: String(form.get("phone") ?? "").trim(),
		email: String(form.get("email") ?? "").trim(),
	});
	return redirect("/vendors");
}

export default function Vendors({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	return (
		<div className="max-w-3xl">
			<h1 className={ui.pageTitle}>Vendors</h1>
			<p className="mt-1 text-gray-600">
				Your suppliers. Their contact details stay private — never shown to a
				partner.
			</p>

			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">Add a vendor</h2>
				{actionData?.error && (
					<div className={`${ui.error} mt-2`}>{actionData.error}</div>
				)}
				<Form method="post" className="mt-3 grid gap-3 sm:grid-cols-3">
					<input name="name" placeholder="Name" className={ui.inputSm} />
					<input name="phone" placeholder="Phone" className={ui.inputSm} />
					<input name="email" placeholder="Email" className={ui.inputSm} />
					<div className="sm:col-span-3">
						<button type="submit" className={ui.btnPrimary}>
							Add vendor
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
					{loaderData.vendors.length === 0 && (
						<tr>
							<td className={`${ui.td} text-gray-500`} colSpan={4}>
								No vendors yet.
							</td>
						</tr>
					)}
					{loaderData.vendors.map((v) => (
						<tr key={v.id}>
							<td className={ui.td}>{v.name}</td>
							<td className={ui.td}>{v.phone}</td>
							<td className={ui.td}>{v.email}</td>
							<td className={`${ui.td} text-right`}>
								<Link to={`/vendors/${v.id}`} className={ui.link}>
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
