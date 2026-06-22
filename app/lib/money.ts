// Money helpers. There is no currency in middleguy — amounts are plain numbers
// shown with a comma thousands separator, a dot decimal separator, and a fixed
// 2-decimal precision: e.g. 1,234,567.89.

/** Round a number to 2 decimals using integer-cents to avoid float drift. */
export function roundMoney(n: number): number {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Format a number as `1,234,567.89` (no currency symbol, fixed 2 decimals). */
export function formatMoney(n: number): string {
	const cents = Math.round((n + Number.EPSILON) * 100);
	const sign = cents < 0 ? "-" : "";
	const abs = Math.abs(cents);
	const whole = Math.floor(abs / 100).toString();
	const frac = (abs % 100).toString().padStart(2, "0");
	const withThousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return `${sign}${withThousands}.${frac}`;
}
