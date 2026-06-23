import { asc, eq } from "drizzle-orm";
import { Form, Link, redirect, useFetcher } from "react-router";
import { useAutosaveRow, useClearOnSuccess } from "~/components/add-form";
import { getDb, insertInvoiceLines } from "~/db/client";
import {
	type InvoiceLine,
	type ShippingCost,
	invoiceLines,
	invoices,
	partners,
	shippingCosts,
	vendors,
} from "~/db/schema";
import { safeFileName, toBool, toNum, toNullId, toNullNum } from "~/lib/form";
import { formatMoney } from "~/lib/money";
import { parseInvoice } from "~/lib/parser";
import { computeInvoiceTotals } from "~/lib/pricing";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/invoices.$id";

const STATUSES = [
	"draft",
	"sent",
	"accepted",
	"partner_paid",
	"vendor_paid",
	"received",
	"settled",
	"cancelled",
] as const;

const statusLabel = (s: string) => s.replace(/_/g, " ");

export function meta(_: Route.MetaArgs) {
	return [{ title: "Invoice · middleguy" }];
}

export async function loader({ params, context, request }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	const id = Number(params.id);
	const origin = new URL(request.url).origin;
	const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
	if (!invoice) throw new Response("Not found", { status: 404 });

	const [lines, shipments, vendorOptions, partnerOptions] = await Promise.all([
		db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.sortOrder), asc(invoiceLines.id)),
		db.select().from(shippingCosts).where(eq(shippingCosts.invoiceId, id)).orderBy(asc(shippingCosts.sortOrder), asc(shippingCosts.id)),
		db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(asc(vendors.name)),
		db.select({ id: partners.id, name: partners.name }).from(partners).orderBy(asc(partners.name)),
	]);

	const shippingPaid = shipments.reduce((sum, s) => sum + s.amount, 0);
	const totals = computeInvoiceTotals({
		markupPercent: invoice.markupPercent,
		shippingPaid,
		lines: lines.map((l) => ({
			qty: l.qty,
			unitPrice: l.unitPrice,
			markedUp: l.markedUp,
			isManual: l.isManual,
		})),
	});

	let rawText = "";
	try {
		rawText = invoice.parseRaw ? (JSON.parse(invoice.parseRaw).raw ?? "") : "";
	} catch {
		rawText = "";
	}

	// Vendor files: prefer the multi-part list, fall back to the single legacy key.
	let originalFiles: { key: string; name: string }[] = [];
	try {
		if (invoice.originalFileKeys) originalFiles = JSON.parse(invoice.originalFileKeys);
	} catch {
		originalFiles = [];
	}
	if (originalFiles.length === 0 && invoice.originalFileKey) {
		originalFiles = [{ key: invoice.originalFileKey, name: "Vendor file" }];
	}

	return { invoice, lines, shipments, vendorOptions, partnerOptions, totals, rawText, originalFiles, origin };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const db = getDb(context.cloudflare.env);
	const id = Number(params.id);
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");

	switch (intent) {
		case "meta-update": {
			await db
				.update(invoices)
				.set({
					invoiceNumber: String(form.get("invoiceNumber") ?? "").trim(),
					vendorId: toNullId(form.get("vendorId")),
					partnerId: toNullId(form.get("partnerId")),
					markupPercent: toNum(form.get("markupPercent"), 0),
					notes: String(form.get("notes") ?? "").trim(),
					updatedAt: new Date(),
				})
				.where(eq(invoices.id, id));
			break;
		}
		case "files-add": {
			const env = context.cloudflare.env;
			const files = form
				.getAll("file")
				.filter((f): f is File => f instanceof File && f.size > 0);
			if (files.length === 0) {
				return { error: "Choose at least one file (PDF or image) to add." };
			}

			const [inv] = await db
				.select({
					originalFileKey: invoices.originalFileKey,
					originalFileKeys: invoices.originalFileKeys,
					parseRaw: invoices.parseRaw,
				})
				.from(invoices)
				.where(eq(invoices.id, id))
				.limit(1);
			if (!inv) throw new Response("Not found", { status: 404 });

			// Store every new part in R2.
			const stamp = Date.now();
			const stored = await Promise.all(
				files.map(async (file, i) => {
					const key = `invoices/${stamp}-${i}-${safeFileName(file.name)}`;
					await env.FILES.put(key, await file.arrayBuffer(), {
						httpMetadata: { contentType: file.type || "application/octet-stream" },
					});
					return { key, name: file.name };
				}),
			);

			// Merge the new parts into the existing file list (handle legacy rows
			// that only have the single originalFileKey).
			let existingFiles: { key: string; name: string }[] = [];
			try {
				if (inv.originalFileKeys) existingFiles = JSON.parse(inv.originalFileKeys);
			} catch {
				existingFiles = [];
			}
			if (existingFiles.length === 0 && inv.originalFileKey) {
				existingFiles = [{ key: inv.originalFileKey, name: "Vendor file" }];
			}
			const allFiles = [...existingFiles, ...stored];

			const parsed = await parseInvoice(env, files);

			// Append parsed lines after whatever is already on the invoice.
			const existingLines = await db
				.select({ sortOrder: invoiceLines.sortOrder })
				.from(invoiceLines)
				.where(eq(invoiceLines.invoiceId, id));
			const base = existingLines.reduce((m, r) => Math.max(m, r.sortOrder), 0);
			await insertInvoiceLines(
				db,
				parsed.lines.map((l, idx) => ({
					invoiceId: id,
					name: l.name,
					qty: l.qty,
					unitPrice: l.unitPrice,
					markedUp: true,
					isManual: false,
					sortOrder: base + 1 + idx,
				})),
			);

			// Keep the audit trail: append the new OCR text to the stored raw.
			let prevRaw = "";
			try {
				prevRaw = inv.parseRaw ? (JSON.parse(inv.parseRaw).raw ?? "") : "";
			} catch {
				prevRaw = "";
			}
			const mergedRaw = [prevRaw, parsed.raw].filter(Boolean).join("\n\n");

			await db
				.update(invoices)
				.set({
					originalFileKey: inv.originalFileKey ?? stored[0].key,
					originalFileKeys: JSON.stringify(allFiles),
					parseRaw: JSON.stringify({ total: parsed.total, raw: mergedRaw }).slice(0, 200000),
					updatedAt: new Date(),
				})
				.where(eq(invoices.id, id));

			return { ok: true as const, added: parsed.lines.length };
		}
		case "line-add": {
			await db.insert(invoiceLines).values({
				invoiceId: id,
				name: String(form.get("name") ?? "").trim(),
				qty: toNum(form.get("qty"), 1),
				unitPrice: toNum(form.get("unitPrice"), 0),
				markedUp: toBool(form.get("markedUp")),
				isManual: true,
				sortOrder: Date.now(),
			});
			break;
		}
		case "line-update": {
			await db
				.update(invoiceLines)
				.set({
					name: String(form.get("name") ?? "").trim(),
					qty: toNum(form.get("qty"), 1),
					unitPrice: toNum(form.get("unitPrice"), 0),
					markedUp: toBool(form.get("markedUp")),
				})
				.where(eq(invoiceLines.id, Number(form.get("lineId"))));
			break;
		}
		case "line-delete": {
			await db.delete(invoiceLines).where(eq(invoiceLines.id, Number(form.get("lineId"))));
			break;
		}
		case "recon-update": {
			await db
				.update(invoiceLines)
				.set({ receivedQty: toNullNum(form.get("receivedQty")) })
				.where(eq(invoiceLines.id, Number(form.get("lineId"))));
			break;
		}
		case "ship-add": {
			await db.insert(shippingCosts).values({
				invoiceId: id,
				label: String(form.get("label") ?? "").trim(),
				courier: String(form.get("courier") ?? "").trim(),
				amount: toNum(form.get("amount"), 0),
				sortOrder: Date.now(),
			});
			break;
		}
		case "ship-update": {
			await db
				.update(shippingCosts)
				.set({
					label: String(form.get("label") ?? "").trim(),
					courier: String(form.get("courier") ?? "").trim(),
					amount: toNum(form.get("amount"), 0),
				})
				.where(eq(shippingCosts.id, Number(form.get("shipId"))));
			break;
		}
		case "ship-delete": {
			await db.delete(shippingCosts).where(eq(shippingCosts.id, Number(form.get("shipId"))));
			break;
		}
		case "status-set": {
			const status = String(form.get("status") ?? "draft");
			const now = new Date();
			const patch: Partial<typeof invoices.$inferInsert> = { status, updatedAt: now };
			if (status === "accepted") patch.acceptedAt = now;
			else if (status === "partner_paid") patch.partnerPaidAt = now;
			else if (status === "vendor_paid") patch.vendorPaidAt = now;
			else if (status === "received") patch.receivedAt = now;
			else if (status === "settled") patch.settledAt = now;
			await db.update(invoices).set(patch).where(eq(invoices.id, id));
			break;
		}
		case "share-create": {
			const env = context.cloudflare.env;
			const [inv] = await db
				.select({ shareToken: invoices.shareToken })
				.from(invoices)
				.where(eq(invoices.id, id))
				.limit(1);
			const token = inv?.shareToken || crypto.randomUUID().replace(/-/g, "");
			await env.SHARE_LINKS.put(token, String(id));
			await db.update(invoices).set({ shareToken: token }).where(eq(invoices.id, id));
			break;
		}
		case "share-revoke": {
			const env = context.cloudflare.env;
			const [inv] = await db
				.select({ shareToken: invoices.shareToken })
				.from(invoices)
				.where(eq(invoices.id, id))
				.limit(1);
			if (inv?.shareToken) await env.SHARE_LINKS.delete(inv.shareToken);
			await db.update(invoices).set({ shareToken: null }).where(eq(invoices.id, id));
			break;
		}
		case "invoice-delete": {
			await db.delete(invoices).where(eq(invoices.id, id));
			return redirect("/invoices");
		}
	}
	return { ok: true as const };
}

function LineRow({
	line,
	customerUnitPrice,
	customerLineTotal,
}: {
	line: InvoiceLine;
	customerUnitPrice: number;
	customerLineTotal: number;
}) {
	const { fetcher, formRef, markDirty, saveIfDirty } = useAutosaveRow();
	const del = useFetcher();
	return (
		<div className="grid grid-cols-[1fr_4rem_6rem_3rem_6rem_6rem_auto] items-center gap-2 py-1">
			<fetcher.Form ref={formRef} method="post" className="contents" onChange={markDirty} onBlur={saveIfDirty}>
				<input type="hidden" name="intent" value="line-update" />
				<input type="hidden" name="lineId" value={line.id} />
				<input name="name" defaultValue={line.name} className={ui.inputSm} />
				<input name="qty" type="number" step="any" defaultValue={line.qty} className={ui.inputSm} />
				<input name="unitPrice" type="number" step="0.01" defaultValue={line.unitPrice} className={ui.inputSm} title="Your cost / base" />
				<label className="flex items-center justify-center" title="Apply markup?">
					<input type="checkbox" name="markedUp" defaultChecked={line.markedUp} />
				</label>
			</fetcher.Form>
			<div className="text-right text-sm tabular-nums" title="Customer unit price">
				{formatMoney(customerUnitPrice)}
			</div>
			<div className="text-right text-sm font-medium tabular-nums" title="Customer line total">
				{formatMoney(customerLineTotal)}
			</div>
			<del.Form method="post" className="contents">
				<input type="hidden" name="intent" value="line-delete" />
				<input type="hidden" name="lineId" value={line.id} />
				<button
					type="submit"
					className={ui.btnDanger}
					onClick={(e) => {
						if (!confirm("Delete this line?")) e.preventDefault();
					}}
				>
					✕
				</button>
			</del.Form>
		</div>
	);
}

function AddLineForm() {
	const fetcher = useFetcher<typeof action>();
	const { formRef, focusRef } = useClearOnSuccess(
		fetcher.state === "idle" && !!fetcher.data?.ok,
	);
	return (
		<fetcher.Form ref={formRef} method="post" className="mt-2 grid grid-cols-[1fr_4rem_6rem_3rem_6rem_6rem_auto] items-center gap-2 border-t border-gray-100 pt-2">
			<input type="hidden" name="intent" value="line-add" />
			<input ref={focusRef} name="name" placeholder="New line (e.g. Shipping)" className={ui.inputSm} />
			<input name="qty" type="number" step="any" defaultValue={1} className={ui.inputSm} />
			<input name="unitPrice" type="number" step="0.01" defaultValue={0} className={ui.inputSm} />
			<label className="flex items-center justify-center" title="Apply markup?">
				<input type="checkbox" name="markedUp" />
			</label>
			<div className="col-span-2 text-right text-xs text-gray-400">manual line</div>
			<button type="submit" className={ui.btnPrimary} disabled={fetcher.state !== "idle"}>
				Add
			</button>
		</fetcher.Form>
	);
}

function AddShipForm() {
	const fetcher = useFetcher<typeof action>();
	const { formRef, focusRef } = useClearOnSuccess(
		fetcher.state === "idle" && !!fetcher.data?.ok,
	);
	return (
		<fetcher.Form ref={formRef} method="post" className="mt-2 grid grid-cols-[1fr_1fr_7rem_auto] items-center gap-2 border-t border-gray-100 pt-2">
			<input type="hidden" name="intent" value="ship-add" />
			<input ref={focusRef} name="label" placeholder="e.g. Leg 1" className={ui.inputSm} />
			<input name="courier" placeholder="Courier" className={ui.inputSm} />
			<input name="amount" type="number" step="0.01" defaultValue={0} className={`${ui.inputSm} text-right`} />
			<button type="submit" className={ui.btnPrimary} disabled={fetcher.state !== "idle"}>
				Add
			</button>
		</fetcher.Form>
	);
}

function ShipRow({ s }: { s: ShippingCost }) {
	const { fetcher, formRef, markDirty, saveIfDirty } = useAutosaveRow();
	const del = useFetcher();
	return (
		<div className="grid grid-cols-[1fr_1fr_7rem_auto] items-center gap-2 py-1">
			<fetcher.Form ref={formRef} method="post" className="contents" onChange={markDirty} onBlur={saveIfDirty}>
				<input type="hidden" name="intent" value="ship-update" />
				<input type="hidden" name="shipId" value={s.id} />
				<input name="label" defaultValue={s.label} className={ui.inputSm} />
				<input name="courier" defaultValue={s.courier} className={ui.inputSm} />
				<input name="amount" type="number" step="0.01" defaultValue={s.amount} className={`${ui.inputSm} text-right`} />
			</fetcher.Form>
			<del.Form method="post" className="contents">
				<input type="hidden" name="intent" value="ship-delete" />
				<input type="hidden" name="shipId" value={s.id} />
				<button
					type="submit"
					className={ui.btnDanger}
					onClick={(e) => {
						if (!confirm("Delete this shipping entry?")) e.preventDefault();
					}}
				>
					✕
				</button>
			</del.Form>
		</div>
	);
}

function ReconRow({ line }: { line: InvoiceLine }) {
	const { fetcher, formRef, markDirty, saveIfDirty } = useAutosaveRow();
	const mismatch = line.receivedQty != null && line.receivedQty !== line.qty;
	return (
		<div className="grid grid-cols-[1fr_5rem_6rem] items-center gap-2 py-1">
			<div className={`text-sm ${mismatch ? "font-semibold text-red-700" : ""}`}>
				{line.name || "—"} {mismatch && "⚠"}
			</div>
			<div className="text-right text-sm tabular-nums">{line.qty}</div>
			<fetcher.Form ref={formRef} method="post" className="contents" onChange={markDirty} onBlur={saveIfDirty}>
				<input type="hidden" name="intent" value="recon-update" />
				<input type="hidden" name="lineId" value={line.id} />
				<input name="receivedQty" type="number" step="any" defaultValue={line.receivedQty ?? ""} className={`${ui.inputSm} text-right`} />
			</fetcher.Form>
		</div>
	);
}

function Spinner() {
	return (
		<svg
			className="h-4 w-4 animate-spin"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
		</svg>
	);
}

function AddFilesForm() {
	const fetcher = useFetcher<typeof action>();
	const adding = fetcher.state !== "idle";
	const { formRef } = useClearOnSuccess(
		fetcher.state === "idle" && !!fetcher.data?.ok,
	);
	return (
		<div className="mt-4 border-t border-gray-100 pt-3">
			<h3 className="text-sm font-semibold">Add more vendor files</h3>
			<p className="mt-0.5 text-xs text-gray-500">
				Upload another batch of photos/PDFs. The parsed line items are appended
				to this invoice (marked up by the invoice’s margin).
			</p>
			{fetcher.data?.error && (
				<div className={`${ui.error} mt-2`}>{fetcher.data.error}</div>
			)}
			{fetcher.state === "idle" && typeof fetcher.data?.added === "number" && (
				<div className="mt-2 text-sm text-green-700">
					Added {fetcher.data.added} line{fetcher.data.added === 1 ? "" : "s"}.
				</div>
			)}
			<fetcher.Form
				ref={formRef}
				method="post"
				encType="multipart/form-data"
				className="mt-2 flex flex-wrap items-center gap-3"
			>
				<input type="hidden" name="intent" value="files-add" />
				<input
					name="file"
					type="file"
					multiple
					accept="application/pdf,image/*"
					className="block text-sm"
				/>
				<button
					type="submit"
					className={ui.btnPrimary}
					disabled={adding}
					aria-busy={adding}
				>
					{adding ? (
						<span className="inline-flex items-center gap-2">
							<Spinner />
							Uploading & parsing…
						</span>
					) : (
						"Upload & parse"
					)}
				</button>
				{adding && (
					<span className="text-xs text-gray-500">
						Reading the files and extracting line items — this can take a few
						seconds.
					</span>
				)}
			</fetcher.Form>
		</div>
	);
}

export default function InvoiceEditor({ loaderData }: Route.ComponentProps) {
	const { invoice, lines, shipments, vendorOptions, partnerOptions, totals, rawText, originalFiles, origin } = loaderData;

	return (
		<div className="max-w-4xl">
			<div className="flex items-center justify-between">
				<Link to="/invoices" className={ui.link}>
					← Invoices
				</Link>
				<a href={`/invoices/${invoice.id}/print`} target="_blank" rel="noreferrer" className={ui.btnSecondary}>
					Print / preview
				</a>
			</div>
			<div className="mt-2 flex items-center gap-3">
				<h1 className={ui.pageTitle}>{invoice.invoiceNumber || `Invoice #${invoice.id}`}</h1>
				<span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
					{statusLabel(invoice.status)}
				</span>
			</div>

			{/* Meta */}
			<div className={`${ui.card} mt-4`}>
				<Form method="post" className="space-y-3">
					<input type="hidden" name="intent" value="meta-update" />
					<div className="grid gap-3 sm:grid-cols-4">
						<div>
							<label className={ui.label}>Number</label>
							<input name="invoiceNumber" defaultValue={invoice.invoiceNumber} className={ui.input} />
						</div>
						<div>
							<label className={ui.label}>Markup %</label>
							<input name="markupPercent" type="number" step="0.01" min="0" defaultValue={invoice.markupPercent} className={ui.input} />
						</div>
						<div>
							<label className={ui.label}>Vendor</label>
							<select name="vendorId" defaultValue={invoice.vendorId ?? ""} className={ui.input}>
								<option value="">— none —</option>
								{vendorOptions.map((v) => (
									<option key={v.id} value={v.id}>{v.name}</option>
								))}
							</select>
						</div>
						<div>
							<label className={ui.label}>Partner</label>
							<select name="partnerId" defaultValue={invoice.partnerId ?? ""} className={ui.input}>
								<option value="">— none —</option>
								{partnerOptions.map((p) => (
									<option key={p.id} value={p.id}>{p.name}</option>
								))}
							</select>
						</div>
					</div>
					<div>
						<label className={ui.label}>Notes (shown to customer)</label>
						<textarea name="notes" rows={2} defaultValue={invoice.notes} className={ui.input} />
					</div>
					<button type="submit" className={ui.btnPrimary}>Save details</button>
				</Form>
				{originalFiles.length > 0 && (
					<div className="mt-3 text-sm">
						<span className="text-gray-500">
							{originalFiles.length > 1 ? "Original vendor files:" : "Original vendor file:"}
						</span>
						<ul className="mt-1 space-y-0.5">
							{originalFiles.map((f, i) => (
								<li key={f.key}>
									<a href={`/files/${f.key}`} target="_blank" rel="noreferrer" className={ui.link}>
										{f.name || `Part ${i + 1}`}
									</a>
								</li>
							))}
						</ul>
					</div>
				)}
				<AddFilesForm />
			</div>

			{/* Lines */}
			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">Line items</h2>
				<div className="mt-1 grid grid-cols-[1fr_4rem_6rem_3rem_6rem_6rem_auto] gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
					<div>Name</div>
					<div>Qty</div>
					<div>Your cost</div>
					<div className="text-center">Mark↑</div>
					<div className="text-right">Cust. unit</div>
					<div className="text-right">Cust. total</div>
					<div />
				</div>
				{lines.map((l, idx) => (
					<LineRow
						key={l.id}
						line={l}
						customerUnitPrice={totals.lines[idx].customerUnitPrice}
						customerLineTotal={totals.lines[idx].customerLineTotal}
					/>
				))}

				{/* Add manual line */}
				<AddLineForm />
			</div>

			{/* Shipping cost log (internal) */}
			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">Shipping costs (private log)</h2>
				<p className="text-sm text-gray-500">
					What you actually paid to move the goods. Not shown to the customer and
					not added as a line — it just feeds your profit below. To charge for
					shipping, add a line item above.
				</p>
				<div className="mt-2 grid grid-cols-[1fr_1fr_7rem_auto] gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
					<div>Label</div>
					<div>Courier</div>
					<div className="text-right">Amount</div>
					<div />
				</div>
				{shipments.map((s) => (
					<ShipRow key={s.id} s={s} />
				))}
				<AddShipForm />
				<p className="mt-2 text-right text-sm text-gray-600">
					Shipping paid: <span className="tabular-nums font-medium">{formatMoney(totals.shippingPaid)}</span>
				</p>
			</div>

			{/* Totals (owner only) */}
			<div className={`${ui.card} mt-6 bg-gray-900 text-white`}>
				<div className="flex items-baseline justify-between">
					<span className="text-sm uppercase tracking-wide text-gray-300">Customer total</span>
					<span className="text-2xl font-bold tabular-nums">{formatMoney(totals.customerTotal)}</span>
				</div>
				<div className="mt-3 space-y-1 border-t border-gray-700 pt-3 text-sm text-gray-300">
					<div className="flex justify-between"><span>− Vendor goods cost</span><span className="tabular-nums">{formatMoney(totals.vendorGoodsCost)}</span></div>
					<div className="flex justify-between"><span>− Shipping paid</span><span className="tabular-nums">{formatMoney(totals.shippingPaid)}</span></div>
					<div className="flex justify-between font-semibold text-white"><span>= Profit</span><span className="tabular-nums">{formatMoney(totals.profit)}</span></div>
				</div>
			</div>

			{/* Share */}
			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">Customer view & sharing</h2>
				<p className="text-sm text-gray-500">
					A read-only page showing only final prices — never your cost, margin, or
					shipping log.
				</p>
				{invoice.shareToken ? (
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<input
							readOnly
							value={`${origin}/i/${invoice.shareToken}`}
							onFocus={(e) => e.currentTarget.select()}
							className={`${ui.inputSm} max-w-md`}
						/>
						<a href={`/i/${invoice.shareToken}`} target="_blank" rel="noreferrer" className={ui.btnSecondary}>
							Open
						</a>
						<Form method="post">
							<button
								type="submit"
								name="intent"
								value="share-revoke"
								className={ui.btnDanger}
								onClick={(e) => {
									if (!confirm("Revoke this share link?")) e.preventDefault();
								}}
							>
								Revoke
							</button>
						</Form>
					</div>
				) : (
					<Form method="post" className="mt-2">
						<button type="submit" name="intent" value="share-create" className={ui.btnPrimary}>
							Create share link
						</button>
					</Form>
				)}
			</div>

			{/* Status */}
			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">Status</h2>
				<p className="text-sm text-gray-500">You flip this manually as the deal progresses.</p>
				<Form method="post" className="mt-2 flex flex-wrap items-center gap-2">
					<input type="hidden" name="intent" value="status-set" />
					<select name="status" defaultValue={invoice.status} className={`${ui.inputSm} max-w-[12rem] capitalize`}>
						{STATUSES.map((s) => (
							<option key={s} value={s}>{statusLabel(s)}</option>
						))}
					</select>
					<button type="submit" className={ui.btnPrimary}>Update status</button>
				</Form>
			</div>

			{/* Reconciliation */}
			<div className={`${ui.card} mt-6`}>
				<h2 className="font-semibold">Reconciliation</h2>
				<p className="text-sm text-gray-500">
					When goods arrive, enter what you actually received. Mismatches are
					flagged.
				</p>
				<div className="mt-2 grid grid-cols-[1fr_5rem_6rem] gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
					<div>Name</div>
					<div className="text-right">Ordered</div>
					<div className="text-right">Received</div>
				</div>
				{lines.map((l) => (
					<ReconRow key={l.id} line={l} />
				))}
			</div>

			{/* Danger */}
			<Form method="post" className="mt-10 border-t border-gray-200 pt-4">
				<button
					type="submit"
					name="intent"
					value="invoice-delete"
					className={ui.btnDanger}
					onClick={(e) => { if (!confirm("Delete this invoice?")) e.preventDefault(); }}
				>
					Delete invoice
				</button>
			</Form>

			{rawText && (
				<details className="mt-6 text-sm text-gray-600">
					<summary className="cursor-pointer">Parsed source text (audit)</summary>
					<pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-gray-100 p-3 text-xs">{rawText}</pre>
				</details>
			)}
		</div>
	);
}
