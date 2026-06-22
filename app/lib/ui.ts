// Shared Tailwind class strings so forms/tables look consistent across routes.
// (Tailwind v4 scans .ts files via `source(".")` in app.css, so these literals
// are picked up by the JIT.)
export const ui = {
	label: "block text-sm font-medium text-gray-700",
	input:
		"mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none",
	inputSm:
		"block w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-gray-900 focus:outline-none",
	btnPrimary:
		"inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50",
	btnSecondary:
		"inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50",
	btnDanger:
		"inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50",
	card: "rounded-lg border border-gray-200 bg-white p-4",
	table: "w-full border-collapse",
	th: "border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500",
	td: "border-b border-gray-100 px-3 py-2 text-sm",
	link: "font-medium text-gray-900 underline underline-offset-2 hover:text-gray-600",
	error: "rounded-md bg-red-50 px-4 py-2 text-sm text-red-800",
	pageTitle: "text-2xl font-bold",
};
