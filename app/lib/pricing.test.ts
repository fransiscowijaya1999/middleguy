import { describe, expect, test } from "bun:test";
import { formatMoney, roundMoney } from "./money";
import { computeInvoiceTotals, customerUnitPrice } from "./pricing";

describe("formatMoney", () => {
	test("comma thousands, dot decimal, 2 decimals", () => {
		expect(formatMoney(1234567.89)).toBe("1,234,567.89");
		expect(formatMoney(0)).toBe("0.00");
		expect(formatMoney(5)).toBe("5.00");
		expect(formatMoney(467.5)).toBe("467.50");
		expect(formatMoney(1000)).toBe("1,000.00");
		expect(formatMoney(-1234.5)).toBe("-1,234.50");
	});

	test("rounds half up at 2 decimals", () => {
		expect(formatMoney(2.005)).toBe("2.01");
		expect(roundMoney(2.005)).toBe(2.01);
	});
});

describe("customerUnitPrice", () => {
	test("applies margin to marked-up lines", () => {
		expect(customerUnitPrice(1000, true, 10)).toBe(1100);
		expect(customerUnitPrice(2000, true, 10)).toBe(2200);
		expect(customerUnitPrice(425, true, 10)).toBe(467.5);
	});

	test("passes non-marked lines through unchanged", () => {
		expect(customerUnitPrice(450, false, 10)).toBe(450);
	});

	test("handles fractional margin", () => {
		expect(customerUnitPrice(100, true, 12.5)).toBe(112.5);
	});
});

describe("computeInvoiceTotals — worked example from the plan", () => {
	const result = computeInvoiceTotals({
		markupPercent: 10,
		shippingPaid: 425, // internal log 25 + 100 + 300
		lines: [
			{ qty: 10, unitPrice: 1000, markedUp: true, isManual: false },
			{ qty: 5, unitPrice: 2000, markedUp: true, isManual: false },
			// owner-added shipping line, not marked up
			{ qty: 1, unitPrice: 450, markedUp: false, isManual: true },
		],
	});

	test("customer total", () => {
		expect(result.customerTotal).toBe(22450);
	});

	test("per-line customer figures", () => {
		expect(result.lines[0]).toEqual({
			customerUnitPrice: 1100,
			customerLineTotal: 11000,
		});
		expect(result.lines[1]).toEqual({
			customerUnitPrice: 2200,
			customerLineTotal: 11000,
		});
		expect(result.lines[2]).toEqual({
			customerUnitPrice: 450,
			customerLineTotal: 450,
		});
	});

	test("owner-only profit breakdown", () => {
		expect(result.vendorGoodsCost).toBe(20000);
		expect(result.shippingPaid).toBe(425);
		expect(result.profit).toBe(2025);
	});
});

describe("computeInvoiceTotals — edge cases", () => {
	test("a marked manual line is full profit (not counted as cost)", () => {
		const r = computeInvoiceTotals({
			markupPercent: 20,
			shippingPaid: 0,
			lines: [{ qty: 2, unitPrice: 100, markedUp: true, isManual: true }],
		});
		expect(r.customerTotal).toBe(240); // 100*1.2*2
		expect(r.vendorGoodsCost).toBe(0);
		expect(r.profit).toBe(240);
	});

	test("a non-marked parsed line is pass-through (zero profit on it)", () => {
		const r = computeInvoiceTotals({
			markupPercent: 30,
			shippingPaid: 0,
			lines: [{ qty: 3, unitPrice: 50, markedUp: false, isManual: false }],
		});
		expect(r.customerTotal).toBe(150);
		expect(r.vendorGoodsCost).toBe(150);
		expect(r.profit).toBe(0);
	});

	test("fractional quantities round per line", () => {
		const r = computeInvoiceTotals({
			markupPercent: 0,
			shippingPaid: 0,
			lines: [{ qty: 2.5, unitPrice: 10.1, markedUp: true, isManual: false }],
		});
		expect(r.customerTotal).toBe(25.25);
	});

	test("empty invoice totals to zero", () => {
		const r = computeInvoiceTotals({
			markupPercent: 10,
			shippingPaid: 0,
			lines: [],
		});
		expect(r.customerTotal).toBe(0);
		expect(r.profit).toBe(0);
	});
});
