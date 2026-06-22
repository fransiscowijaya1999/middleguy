import { asc, eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { invoiceLines, invoices, partners } from "~/db/schema";
import { computeInvoiceTotals } from "~/lib/pricing";
import { getSettings } from "~/lib/settings";

// Single source of the "customer-facing fields ONLY" rule. Both the public share
// page (/i/:token) and the owner's print preview (/invoices/:id/print) use this,
// so cost, markup %, profit, and the shipping log can never leak into either.
export async function getCustomerInvoiceData(db: Db, id: number) {
	const [invoice] = await db
		.select()
		.from(invoices)
		.where(eq(invoices.id, id))
		.limit(1);
	if (!invoice) return null;

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

export type CustomerInvoiceData = NonNullable<
	Awaited<ReturnType<typeof getCustomerInvoiceData>>
>;
