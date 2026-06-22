import { asc, eq } from "drizzle-orm";
import { getDb } from "~/db/client";
import { invoiceLines, invoices, partners } from "~/db/schema";
import { formatMoney } from "~/lib/money";
import { computeInvoiceTotals } from "~/lib/pricing";
import { getSettings } from "~/lib/settings";
import type { Route } from "./+types/i.$token";

export function meta({ data }: Route.MetaArgs) {
	const biz = data?.business.name ?? "Invoice";
	const num = data?.invoice.number;
	return [{ title: num ? `${biz} · ${num}` : biz }];
}

function formatDate(d: Date | string | number) {
	const date = d instanceof Date ? d : new Date(d);
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-CA");
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const token = params.token;
	const idStr = token ? await env.SHARE_LINKS.get(token) : null;
	if (!idStr) throw new Response("Not found", { status: 404 });
	const id = Number(idStr);

	const db = getDb(env);
	const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
	if (!invoice) throw new Response("Not found", { status: 404 });

	const [lines, settings, partnerRows] = await Promise.all([
		db
			.select()
			.from(invoiceLines)
			.where(eq(invoiceLines.invoiceId, id))
			.orderBy(asc(invoiceLines.sortOrder), asc(invoiceLines.id)),
		getSettings(db),
		invoice.partnerId
			? db.select().from(partners).where(eq(partners.id, invoice.partnerId)).limit(1)
			: Promise.resolve([]),
	]);

	const totals = computeInvoiceTotals({
		markupPercent: invoice.markupPercent,
		shippingPaid: 0, // not part of the customer-facing math
		lines: lines.map((l) => ({
			qty: l.qty,
			unitPrice: l.unitPrice,
			markedUp: l.markedUp,
			isManual: l.isManual,
		})),
	});

	const partner = partnerRows[0] ?? null;

	// IMPORTANT: return ONLY customer-facing fields. Anything returned here is
	// serialized into the page for hydration, so cost, markup %, profit, and the
	// shipping log must never appear in this object.
	return {
		business: {
			name: settings.businessName,
			address: settings.address,
			contact: settings.contact,
			logoKey: settings.logoKey,
		},
		invoice: {
			number: invoice.invoiceNumber,
			date: invoice.createdAt,
			notes: invoice.notes,
		},
		partner: partner
			? { name: partner.name, phone: partner.phone, email: partner.email }
			: null,
		lines: lines.map((l, idx) => ({
			id: l.id,
			name: l.name,
			qty: l.qty,
			unitPrice: totals.lines[idx].customerUnitPrice,
			amount: totals.lines[idx].customerLineTotal,
		})),
		total: totals.customerTotal,
	};
}

export default function CustomerInvoice({ loaderData }: Route.ComponentProps) {
	const { business, invoice, partner, lines, total } = loaderData;

	return (
		<div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
			<div className="mx-auto max-w-2xl bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
				{/* Header */}
				<div className="flex items-start justify-between border-b border-gray-200 pb-6">
					<div>
						{business.logoKey && (
							<img
								src={`/files/${business.logoKey}`}
								alt={business.name}
								className="mb-2 h-14 w-auto object-contain"
							/>
						)}
						<div className="text-lg font-bold">{business.name}</div>
						{business.address && (
							<div className="whitespace-pre-line text-sm text-gray-600">{business.address}</div>
						)}
						{business.contact && (
							<div className="text-sm text-gray-600">{business.contact}</div>
						)}
					</div>
					<div className="text-right">
						<div className="text-xl font-bold uppercase tracking-wide text-gray-700">Invoice</div>
						{invoice.number && (
							<div className="text-sm text-gray-600">{invoice.number}</div>
						)}
						<div className="text-sm text-gray-600">{formatDate(invoice.date)}</div>
					</div>
				</div>

				{/* Bill to */}
				{partner && (
					<div className="pt-6">
						<div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bill to</div>
						<div className="font-medium">{partner.name}</div>
						{partner.phone && <div className="text-sm text-gray-600">{partner.phone}</div>}
						{partner.email && <div className="text-sm text-gray-600">{partner.email}</div>}
					</div>
				)}

				{/* Lines */}
				<table className="mt-6 w-full border-collapse">
					<thead>
						<tr className="border-b-2 border-gray-300">
							<th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item</th>
							<th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</th>
							<th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Unit price</th>
							<th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
						</tr>
					</thead>
					<tbody>
						{lines.map((l) => (
							<tr key={l.id} className="border-b border-gray-100">
								<td className="py-2 text-sm">{l.name}</td>
								<td className="py-2 text-right text-sm tabular-nums">{l.qty}</td>
								<td className="py-2 text-right text-sm tabular-nums">{formatMoney(l.unitPrice)}</td>
								<td className="py-2 text-right text-sm tabular-nums">{formatMoney(l.amount)}</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr>
							<td colSpan={3} className="pt-4 text-right font-semibold">Total</td>
							<td className="pt-4 text-right text-lg font-bold tabular-nums">{formatMoney(total)}</td>
						</tr>
					</tfoot>
				</table>

				{invoice.notes && (
					<div className="mt-6 border-t border-gray-200 pt-4 text-sm text-gray-600">
						<div className="whitespace-pre-line">{invoice.notes}</div>
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
