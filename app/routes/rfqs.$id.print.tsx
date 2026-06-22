import { asc, eq } from "drizzle-orm";
import { redirect } from "react-router";
import { getDb } from "~/db/client";
import { rfqItems, rfqSections, rfqs, vendors } from "~/db/schema";
import { isAuthed } from "~/lib/auth";
import { getSettings } from "~/lib/settings";
import type { Route } from "./+types/rfqs.$id.print";

function formatDate(d: Date | string | number) {
	const date = d instanceof Date ? d : new Date(d);
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-CA");
}

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data ? `RFQ · ${data.rfq.title || "Request"}` : "RFQ" }];
}

export async function loader({ params, context, request }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	if (!(await isAuthed(env, request))) throw redirect("/login");

	const db = getDb(env);
	const id = Number(params.id);
	const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id)).limit(1);
	if (!rfq) throw new Response("Not found", { status: 404 });

	const [sections, items, settings, vendorRows] = await Promise.all([
		db
			.select()
			.from(rfqSections)
			.where(eq(rfqSections.rfqId, id))
			.orderBy(asc(rfqSections.sortOrder), asc(rfqSections.id)),
		db
			.select()
			.from(rfqItems)
			.where(eq(rfqItems.rfqId, id))
			.orderBy(asc(rfqItems.sortOrder), asc(rfqItems.id)),
		getSettings(db),
		rfq.vendorId
			? db.select().from(vendors).where(eq(vendors.id, rfq.vendorId)).limit(1)
			: Promise.resolve([]),
	]);

	// Note: target prices are internal and intentionally NOT included.
	return {
		rfq: { title: rfq.title, notes: rfq.notes, date: rfq.createdAt },
		business: {
			name: settings.businessName,
			address: settings.address,
			contact: settings.contact,
			logoKey: settings.logoKey,
		},
		vendor: vendorRows[0]
			? { name: vendorRows[0].name, phone: vendorRows[0].phone, email: vendorRows[0].email }
			: null,
		sections: sections.map((s) => ({ id: s.id, title: s.title })),
		items: items.map((i) => ({
			id: i.id,
			sectionId: i.sectionId,
			name: i.name,
			qty: i.qty,
			unit: i.unit,
		})),
	};
}

export default function RfqPrint({ loaderData }: Route.ComponentProps) {
	const { rfq, business, vendor, sections, items } = loaderData;
	const ungrouped = items.filter((i) => i.sectionId == null);

	const ItemsTable = ({ rows }: { rows: typeof items }) => (
		<table className="w-full border-collapse">
			<thead>
				<tr className="border-b-2 border-gray-300">
					<th className="py-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item</th>
					<th className="py-1 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</th>
					<th className="py-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Unit</th>
					<th className="py-1 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Unit price</th>
					<th className="py-1 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((i) => (
					<tr key={i.id} className="border-b border-gray-100">
						<td className="py-1.5 text-sm">{i.name}</td>
						<td className="py-1.5 text-right text-sm tabular-nums">{i.qty}</td>
						<td className="py-1.5 text-sm">{i.unit}</td>
						<td className="py-1.5" />
						<td className="py-1.5" />
					</tr>
				))}
			</tbody>
		</table>
	);

	return (
		<div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
			<div className="mx-auto max-w-2xl bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
				<div className="flex items-start justify-between border-b border-gray-200 pb-6">
					<div>
						{business.logoKey && (
							<img src={`/files/${business.logoKey}`} alt={business.name} className="mb-2 h-14 w-auto object-contain" />
						)}
						<div className="text-lg font-bold">{business.name}</div>
						{business.address && <div className="whitespace-pre-line text-sm text-gray-600">{business.address}</div>}
						{business.contact && <div className="text-sm text-gray-600">{business.contact}</div>}
					</div>
					<div className="text-right">
						<div className="text-xl font-bold uppercase tracking-wide text-gray-700">Request for Quote</div>
						{rfq.title && <div className="text-sm text-gray-600">{rfq.title}</div>}
						<div className="text-sm text-gray-600">{formatDate(rfq.date)}</div>
					</div>
				</div>

				{vendor && (
					<div className="pt-6">
						<div className="text-xs font-semibold uppercase tracking-wide text-gray-400">To</div>
						<div className="font-medium">{vendor.name}</div>
						{vendor.phone && <div className="text-sm text-gray-600">{vendor.phone}</div>}
						{vendor.email && <div className="text-sm text-gray-600">{vendor.email}</div>}
					</div>
				)}

				<p className="mt-6 text-sm text-gray-600">
					Please quote your prices for the items below.
				</p>

				<div className="mt-4 space-y-6">
					{sections.map((s) => {
						const rows = items.filter((i) => i.sectionId === s.id);
						if (rows.length === 0) return null;
						return (
							<div key={s.id}>
								<h3 className="mb-1 font-semibold">{s.title || "Section"}</h3>
								<ItemsTable rows={rows} />
							</div>
						);
					})}
					{ungrouped.length > 0 && (
						<div>
							{sections.length > 0 && <h3 className="mb-1 font-semibold">Other items</h3>}
							<ItemsTable rows={ungrouped} />
						</div>
					)}
					{items.length === 0 && <p className="text-sm text-gray-500">No items.</p>}
				</div>

				{rfq.notes && (
					<div className="mt-6 border-t border-gray-200 pt-4 text-sm text-gray-600">
						<div className="whitespace-pre-line">{rfq.notes}</div>
					</div>
				)}

				<div className="mt-8 text-center print:hidden">
					<button
						type="button"
						onClick={() => window.print()}
						className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
					>
						Print / Save as PDF
					</button>
				</div>
			</div>
		</div>
	);
}
