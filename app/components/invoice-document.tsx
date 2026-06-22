import { useRef, useState } from "react";
import type { CustomerInvoiceData } from "~/lib/customer-invoice";
import { formatMoney } from "~/lib/money";

function formatDate(d: Date | string | number) {
	const date = d instanceof Date ? d : new Date(d);
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-CA");
}

/** The customer-facing invoice document. Shared by the public share page and the
 *  owner's print preview. Renders ONLY customer-facing data (see CustomerInvoiceData). */
export function InvoiceDocument({ data }: { data: CustomerInvoiceData }) {
	const { business, invoice, partner, lines, total } = data;
	const cardRef = useRef<HTMLDivElement>(null);
	const [sharing, setSharing] = useState(false);

	async function handleShare() {
		const node = cardRef.current;
		if (!node) return;
		setSharing(true);
		try {
			// Render the invoice card to a PNG so it can be sent as an attachment.
			const { toBlob } = await import("html-to-image");
			const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff" });
			if (!blob) throw new Error("render failed");
			const fileName = `${invoice.number || "invoice"}.png`;
			const file = new File([blob], fileName, { type: "image/png" });
			const nav = navigator as Navigator & {
				canShare?: (data?: { files?: File[] }) => boolean;
			};
			if (nav.canShare?.({ files: [file] })) {
				// Opens the native share sheet (WhatsApp, etc.) with the image attached.
				await nav.share({ files: [file], title: invoice.number || "Invoice" });
			} else {
				// Fallback (e.g. desktop): download the image to attach manually.
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = fileName;
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch {
			// user cancelled the share sheet, or capture failed — nothing to do
		} finally {
			setSharing(false);
		}
	}

	return (
		<div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
			<div
				ref={cardRef}
				className="mx-auto max-w-2xl bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none"
			>
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
			</div>

			{/* Actions (not part of the captured/printed document) */}
			<div className="mx-auto mt-4 flex max-w-2xl justify-center gap-2 print:hidden">
				<button
					type="button"
					onClick={() => window.print()}
					className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>
					Print / Save as PDF
				</button>
				<button
					type="button"
					onClick={handleShare}
					disabled={sharing}
					className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
				>
					{sharing ? "Preparing…" : "Send (WhatsApp, etc.)"}
				</button>
			</div>
		</div>
	);
}
