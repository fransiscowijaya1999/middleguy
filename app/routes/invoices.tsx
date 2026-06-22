import { asc, desc, eq } from "drizzle-orm";
import { Form, Link, redirect } from "react-router";
import { getDb } from "~/db/client";
import { invoiceLines, invoices, partners, vendors } from "~/db/schema";
import { safeFileName, toNum, toNullId } from "~/lib/form";
import { parseInvoice } from "~/lib/parser";
import { getSettings } from "~/lib/settings";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/invoices";

export function meta(_: Route.MetaArgs) {
	return [{ title: "Invoices · middleguy" }];
}

export async function loader({ context }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	const [list, vendorOptions, partnerOptions, settings] = await Promise.all([
		db
			.select({
				id: invoices.id,
				invoiceNumber: invoices.invoiceNumber,
				status: invoices.status,
				createdAt: invoices.createdAt,
				vendorName: vendors.name,
				partnerName: partners.name,
			})
			.from(invoices)
			.leftJoin(vendors, eq(invoices.vendorId, vendors.id))
			.leftJoin(partners, eq(invoices.partnerId, partners.id))
			.orderBy(desc(invoices.createdAt)),
		db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(asc(vendors.name)),
		db.select({ id: partners.id, name: partners.name }).from(partners).orderBy(asc(partners.name)),
		getSettings(db),
	]);
	return {
		invoices: list,
		vendorOptions,
		partnerOptions,
		defaultMarkup: settings.defaultMarkupPercent,
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	const db = getDb(env);
	const form = await request.formData();

	const file = form.get("file");
	if (!(file instanceof File) || file.size === 0) {
		return { error: "Choose an invoice file (PDF or image)." };
	}

	const key = `invoices/${Date.now()}-${safeFileName(file.name)}`;
	await env.FILES.put(key, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type || "application/octet-stream" },
	});

	const parsed = await parseInvoice(env, file);

	const [inv] = await db
		.insert(invoices)
		.values({
			invoiceNumber: String(form.get("invoiceNumber") ?? "").trim(),
			vendorId: toNullId(form.get("vendorId")),
			partnerId: toNullId(form.get("partnerId")),
			markupPercent: toNum(form.get("markupPercent"), 0),
			originalFileKey: key,
			parseRaw: JSON.stringify({ total: parsed.total, raw: parsed.raw }).slice(0, 200000),
		})
		.returning({ id: invoices.id });

	if (parsed.lines.length > 0) {
		await db.insert(invoiceLines).values(
			parsed.lines.map((l, idx) => ({
				invoiceId: inv.id,
				name: l.name,
				qty: l.qty,
				unitPrice: l.unitPrice,
				markedUp: true,
				isManual: false,
				sortOrder: idx,
			})),
		);
	}

	return redirect(`/invoices/${inv.id}`);
}

export default function Invoices({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	return (
		<div className="max-w-4xl">
			<h1 className={ui.pageTitle}>Invoices</h1>
			<p className="mt-1 text-gray-600">
				Upload a vendor invoice (PDF or photo). It’s parsed into line items you
				then review, mark up, and send.
			</p>

			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">New invoice from a vendor file</h2>
				{actionData?.error && (
					<div className={`${ui.error} mt-2`}>{actionData.error}</div>
				)}
				<Form method="post" encType="multipart/form-data" className="mt-3 space-y-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<div>
							<label className={ui.label}>Invoice number (yours)</label>
							<input name="invoiceNumber" className={ui.input} placeholder="e.g. MG-0001" />
						</div>
						<div>
							<label className={ui.label}>Markup %</label>
							<input
								name="markupPercent"
								type="number"
								step="0.01"
								min="0"
								defaultValue={loaderData.defaultMarkup}
								className={ui.input}
							/>
						</div>
						<div>
							<label className={ui.label}>Vendor</label>
							<select name="vendorId" defaultValue="" className={ui.input}>
								<option value="">— none —</option>
								{loaderData.vendorOptions.map((v) => (
									<option key={v.id} value={v.id}>
										{v.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className={ui.label}>Partner</label>
							<select name="partnerId" defaultValue="" className={ui.input}>
								<option value="">— none —</option>
								{loaderData.partnerOptions.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</div>
					</div>
					<div>
						<label className={ui.label}>Vendor invoice file</label>
						<input
							name="file"
							type="file"
							accept="application/pdf,image/*"
							className="mt-1 block text-sm"
						/>
					</div>
					<button type="submit" className={ui.btnPrimary}>
						Upload & parse
					</button>
				</Form>
			</div>

			<table className={`${ui.table} mt-6`}>
				<thead>
					<tr>
						<th className={ui.th}>Number</th>
						<th className={ui.th}>Partner</th>
						<th className={ui.th}>Vendor</th>
						<th className={ui.th}>Status</th>
						<th className={ui.th} />
					</tr>
				</thead>
				<tbody>
					{loaderData.invoices.length === 0 && (
						<tr>
							<td className={`${ui.td} text-gray-500`} colSpan={5}>
								No invoices yet.
							</td>
						</tr>
					)}
					{loaderData.invoices.map((i) => (
						<tr key={i.id}>
							<td className={ui.td}>{i.invoiceNumber || `#${i.id}`}</td>
							<td className={ui.td}>{i.partnerName ?? "—"}</td>
							<td className={ui.td}>{i.vendorName ?? "—"}</td>
							<td className={`${ui.td} capitalize`}>{i.status.replace("_", " ")}</td>
							<td className={`${ui.td} text-right`}>
								<Link to={`/invoices/${i.id}`} className={ui.link}>
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
