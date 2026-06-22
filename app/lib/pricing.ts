import { roundMoney } from "./money";

// The one place money math lives. Pure functions, fully tested. See CLAUDE.md
// "Pricing rules". All arithmetic is done in integer cents to avoid float drift.

export type PricingLine = {
	qty: number;
	/** Base amount per unit (vendor cost for parsed lines, charge for manual lines). */
	unitPrice: number;
	/** Whether the global margin applies to this line. */
	markedUp: boolean;
	/** false = parsed vendor line (counts as cost); true = manual charge line. */
	isManual: boolean;
};

export type PricingInput = {
	/** Global margin as a percent, e.g. 10 means +10%. */
	markupPercent: number;
	lines: PricingLine[];
	/** Sum of the internal shipping_cost log (what the owner actually paid). */
	shippingPaid: number;
};

export type LinePricing = {
	customerUnitPrice: number;
	customerLineTotal: number;
};

export type InvoiceTotals = {
	/** What the customer sees and pays. */
	customerTotal: number;
	/** Owner-only: cost of parsed vendor goods (qty*unitPrice, no markup). */
	vendorGoodsCost: number;
	/** Owner-only: actual shipping paid (the shipping_cost log total). */
	shippingPaid: number;
	/** Owner-only: customerTotal - vendorGoodsCost - shippingPaid. */
	profit: number;
	/** Per-line customer-facing figures, in the same order as input. */
	lines: LinePricing[];
};

const toCents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const fromCents = (c: number) => c / 100;

/** The marked-up (or pass-through) unit price the customer sees for one line. */
export function customerUnitPrice(
	unitPrice: number,
	markedUp: boolean,
	markupPercent: number,
): number {
	if (!markedUp) return roundMoney(unitPrice);
	const cents = toCents(unitPrice);
	return fromCents(Math.round((cents * (100 + markupPercent)) / 100));
}

/** Compute customer-facing totals and the owner-only profit breakdown. */
export function computeInvoiceTotals(input: PricingInput): InvoiceTotals {
	const { markupPercent, shippingPaid } = input;

	let customerTotalCents = 0;
	let vendorGoodsCostCents = 0;
	const lines: LinePricing[] = [];

	for (const line of input.lines) {
		const unit = customerUnitPrice(line.unitPrice, line.markedUp, markupPercent);
		const lineTotal = roundMoney(unit * line.qty);
		customerTotalCents += toCents(lineTotal);
		if (!line.isManual) {
			vendorGoodsCostCents += toCents(roundMoney(line.unitPrice * line.qty));
		}
		lines.push({ customerUnitPrice: unit, customerLineTotal: lineTotal });
	}

	const customerTotal = fromCents(customerTotalCents);
	const vendorGoodsCost = fromCents(vendorGoodsCostCents);
	const profit = roundMoney(customerTotal - vendorGoodsCost - shippingPaid);

	return { customerTotal, vendorGoodsCost, shippingPaid, profit, lines };
}
