import { asc, desc, eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { getDb } from "~/db/client";
import { rfqs, vendors } from "~/db/schema";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/rfqs";

export function meta(_: Route.MetaArgs) {
	return [{ title: "RFQs · middleguy" }];
}

export async function loader({ context }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	const rows = await db
		.select({
			id: rfqs.id,
			title: rfqs.title,
			status: rfqs.status,
			createdAt: rfqs.createdAt,
			vendorName: vendors.name,
		})
		.from(rfqs)
		.leftJoin(vendors, eq(rfqs.vendorId, vendors.id))
		.orderBy(desc(rfqs.createdAt));
	const vendorOptions = await db
		.select({ id: vendors.id, name: vendors.name })
		.from(vendors)
		.orderBy(asc(vendors.name));
	return { rfqs: rows, vendorOptions };
}

export async function action({ request, context }: Route.ActionArgs) {
	const db = getDb(context.cloudflare.env);
	const form = await request.formData();
	const title = String(form.get("title") ?? "").trim();
	if (!title) return { error: "Give the RFQ a title." };
	const vendorIdRaw = String(form.get("vendorId") ?? "");
	const vendorId = vendorIdRaw ? Number(vendorIdRaw) : null;
	const [created] = await db
		.insert(rfqs)
		.values({ title, vendorId })
		.returning({ id: rfqs.id });
	return redirect(`/rfqs/${created.id}`);
}

export default function Rfqs({ loaderData, actionData }: Route.ComponentProps) {
	return (
		<div className="max-w-4xl">
			<h1 className={ui.pageTitle}>RFQs</h1>
			<p className="mt-1 text-gray-600">
				Requests you send to a vendor, organized into sections.
			</p>

			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">New RFQ</h2>
				{actionData?.error && (
					<div className={`${ui.error} mt-2`}>{actionData.error}</div>
				)}
				<Form method="post" className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
					<input name="title" placeholder="Title" className={ui.inputSm} />
					<select name="vendorId" className={ui.inputSm} defaultValue="">
						<option value="">— Vendor (optional) —</option>
						{loaderData.vendorOptions.map((v) => (
							<option key={v.id} value={v.id}>
								{v.name}
							</option>
						))}
					</select>
					<button type="submit" className={ui.btnPrimary}>
						Create
					</button>
				</Form>
			</div>

			<table className={`${ui.table} mt-6`}>
				<thead>
					<tr>
						<th className={ui.th}>Title</th>
						<th className={ui.th}>Vendor</th>
						<th className={ui.th}>Status</th>
						<th className={ui.th} />
					</tr>
				</thead>
				<tbody>
					{loaderData.rfqs.length === 0 && (
						<tr>
							<td className={`${ui.td} text-gray-500`} colSpan={4}>
								No RFQs yet.
							</td>
						</tr>
					)}
					{loaderData.rfqs.map((r) => (
						<tr key={r.id}>
							<td className={ui.td}>{r.title}</td>
							<td className={ui.td}>{r.vendorName ?? "—"}</td>
							<td className={`${ui.td} capitalize`}>{r.status}</td>
							<td className={`${ui.td} text-right`}>
								<Link to={`/rfqs/${r.id}`} className={ui.link}>
									Open
								</Link>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
