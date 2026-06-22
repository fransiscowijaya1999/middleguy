import { asc, eq } from "drizzle-orm";
import { Form, Link, redirect, useFetcher } from "react-router";
import { useAutosaveRow, useClearOnSuccess } from "~/components/add-form";
import { getDb } from "~/db/client";
import {
	type RfqItem,
	rfqItems,
	rfqSections,
	rfqs,
	vendors,
} from "~/db/schema";
import { formatMoney } from "~/lib/money";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/rfqs.$id";

const RFQ_STATUSES = ["draft", "sent", "quoted", "closed"] as const;

function toNum(v: FormDataEntryValue | null, def = 0) {
	const n = Number(v);
	return Number.isFinite(n) ? n : def;
}
function toNullNum(v: FormDataEntryValue | null) {
	const s = String(v ?? "").trim();
	if (!s) return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}
function toNullId(v: FormDataEntryValue | null) {
	const s = String(v ?? "").trim();
	return s ? Number(s) : null;
}

export function meta(_: Route.MetaArgs) {
	return [{ title: "RFQ · middleguy" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const db = getDb(context.cloudflare.env);
	const id = Number(params.id);
	const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id)).limit(1);
	if (!rfq) throw new Response("Not found", { status: 404 });

	const [sections, items, vendorOptions] = await Promise.all([
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
		db
			.select({ id: vendors.id, name: vendors.name })
			.from(vendors)
			.orderBy(asc(vendors.name)),
	]);

	return { rfq, sections, items, vendorOptions };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const db = getDb(context.cloudflare.env);
	const rfqId = Number(params.id);
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");

	switch (intent) {
		case "rfq-update": {
			await db
				.update(rfqs)
				.set({
					title: String(form.get("title") ?? "").trim(),
					vendorId: toNullId(form.get("vendorId")),
					status: String(form.get("status") ?? "draft"),
					notes: String(form.get("notes") ?? "").trim(),
				})
				.where(eq(rfqs.id, rfqId));
			break;
		}
		case "mark-sent": {
			await db.update(rfqs).set({ status: "sent" }).where(eq(rfqs.id, rfqId));
			break;
		}
		case "section-add": {
			await db.insert(rfqSections).values({
				rfqId,
				title: String(form.get("title") ?? "").trim() || "Section",
			});
			break;
		}
		case "section-update": {
			await db
				.update(rfqSections)
				.set({ title: String(form.get("title") ?? "").trim() })
				.where(eq(rfqSections.id, Number(form.get("sectionId"))));
			break;
		}
		case "section-delete": {
			await db
				.delete(rfqSections)
				.where(eq(rfqSections.id, Number(form.get("sectionId"))));
			break;
		}
		case "item-add": {
			await db.insert(rfqItems).values({
				rfqId,
				sectionId: toNullId(form.get("sectionId")),
				name: String(form.get("name") ?? "").trim(),
				qty: toNum(form.get("qty"), 1),
				unit: String(form.get("unit") ?? "").trim(),
				targetPrice: toNullNum(form.get("targetPrice")),
			});
			break;
		}
		case "item-update": {
			await db
				.update(rfqItems)
				.set({
					name: String(form.get("name") ?? "").trim(),
					qty: toNum(form.get("qty"), 1),
					unit: String(form.get("unit") ?? "").trim(),
					targetPrice: toNullNum(form.get("targetPrice")),
				})
				.where(eq(rfqItems.id, Number(form.get("itemId"))));
			break;
		}
		case "item-delete": {
			await db
				.delete(rfqItems)
				.where(eq(rfqItems.id, Number(form.get("itemId"))));
			break;
		}
		case "rfq-delete": {
			await db.delete(rfqs).where(eq(rfqs.id, rfqId));
			return redirect("/rfqs");
		}
	}
	return { ok: true as const };
}

const estItemTotal = (i: { qty: number; targetPrice: number | null }) =>
	i.qty * (i.targetPrice ?? 0);

function ItemRow({ item }: { item: RfqItem }) {
	const { fetcher, formRef, markDirty, saveIfDirty } = useAutosaveRow();
	const del = useFetcher();
	return (
		<div className="grid grid-cols-[1fr_5rem_5rem_7rem_auto] gap-2 py-1">
			<fetcher.Form ref={formRef} method="post" className="contents" onChange={markDirty} onBlur={saveIfDirty}>
				<input type="hidden" name="intent" value="item-update" />
				<input type="hidden" name="itemId" value={item.id} />
				<input name="name" defaultValue={item.name} className={ui.inputSm} />
				<input name="qty" type="number" step="any" defaultValue={item.qty} className={ui.inputSm} />
				<input name="unit" defaultValue={item.unit} placeholder="unit" className={ui.inputSm} />
				<input
					name="targetPrice"
					type="number"
					step="0.01"
					defaultValue={item.targetPrice ?? ""}
					placeholder="target"
					className={ui.inputSm}
				/>
			</fetcher.Form>
			<del.Form method="post" className="contents">
				<input type="hidden" name="intent" value="item-delete" />
				<input type="hidden" name="itemId" value={item.id} />
				<button
					type="submit"
					className={ui.btnDanger}
					onClick={(e) => {
						if (!confirm("Delete this item?")) e.preventDefault();
					}}
				>
					✕
				</button>
			</del.Form>
		</div>
	);
}

function AddItemForm({ sectionId }: { sectionId: number | null }) {
	const fetcher = useFetcher<typeof action>();
	const { formRef, focusRef } = useClearOnSuccess(
		fetcher.state === "idle" && !!fetcher.data?.ok,
	);
	return (
		<fetcher.Form ref={formRef} method="post" className="grid grid-cols-[1fr_5rem_5rem_7rem_auto] gap-2 py-1">
			<input type="hidden" name="intent" value="item-add" />
			<input type="hidden" name="sectionId" value={sectionId ?? ""} />
			<input ref={focusRef} name="name" placeholder="New item" className={ui.inputSm} />
			<input name="qty" type="number" step="any" defaultValue={1} className={ui.inputSm} />
			<input name="unit" placeholder="unit" className={ui.inputSm} />
			<input name="targetPrice" type="number" step="0.01" placeholder="target" className={ui.inputSm} />
			<button type="submit" className={ui.btnPrimary} disabled={fetcher.state !== "idle"}>
				Add
			</button>
		</fetcher.Form>
	);
}

function AddSectionForm() {
	const fetcher = useFetcher<typeof action>();
	const { formRef, focusRef } = useClearOnSuccess(
		fetcher.state === "idle" && !!fetcher.data?.ok,
	);
	return (
		<fetcher.Form ref={formRef} method="post" className="flex items-center gap-2">
			<input type="hidden" name="intent" value="section-add" />
			<input ref={focusRef} name="title" placeholder="New section title" className={`${ui.inputSm} max-w-xs`} />
			<button type="submit" className={ui.btnPrimary}>
				Add section
			</button>
		</fetcher.Form>
	);
}

function SectionSubtotal({ items }: { items: RfqItem[] }) {
	const subtotal = items.reduce((s, i) => s + estItemTotal(i), 0);
	if (items.length === 0) return null;
	return (
		<p className="mt-1 text-right text-xs text-gray-500">
			Est. subtotal (target): <span className="tabular-nums font-medium">{formatMoney(subtotal)}</span>
		</p>
	);
}

export default function RfqEditor({ loaderData }: Route.ComponentProps) {
	const { rfq, sections, items, vendorOptions } = loaderData;
	const ungrouped = items.filter((i) => i.sectionId == null);
	const grandEst = items.reduce((s, i) => s + estItemTotal(i), 0);

	return (
		<div className="max-w-4xl">
			<div className="flex items-center justify-between">
				<Link to="/rfqs" className={ui.link}>
					← RFQs
				</Link>
				<a href={`/rfqs/${rfq.id}/print`} target="_blank" rel="noreferrer" className={ui.btnSecondary}>
					Print / preview
				</a>
			</div>
			<h1 className={`${ui.pageTitle} mt-2`}>RFQ</h1>

			{/* RFQ meta */}
			<div className={`${ui.card} mt-4`}>
				<Form method="post" className="space-y-3">
					<input type="hidden" name="intent" value="rfq-update" />
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="sm:col-span-1">
							<label className={ui.label}>Title</label>
							<input name="title" defaultValue={rfq.title} className={ui.input} />
						</div>
						<div>
							<label className={ui.label}>Vendor</label>
							<select name="vendorId" defaultValue={rfq.vendorId ?? ""} className={ui.input}>
								<option value="">— none —</option>
								{vendorOptions.map((v) => (
									<option key={v.id} value={v.id}>
										{v.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className={ui.label}>Status</label>
							<select name="status" defaultValue={rfq.status} className={`${ui.input} capitalize`}>
								{RFQ_STATUSES.map((s) => (
									<option key={s} value={s}>
										{s}
									</option>
								))}
							</select>
						</div>
					</div>
					<div>
						<label className={ui.label}>Notes</label>
						<textarea name="notes" rows={2} defaultValue={rfq.notes} className={ui.input} />
					</div>
					<div className="flex gap-2">
						<button type="submit" className={ui.btnPrimary}>
							Save
						</button>
					</div>
				</Form>
				<Form method="post" className="mt-2">
					<button type="submit" name="intent" value="mark-sent" className={ui.btnSecondary}>
						Mark as sent
					</button>
				</Form>
			</div>

			{/* Sections + items */}
			<div className="mt-6 space-y-6">
				{sections.map((s) => {
					const sectionItems = items.filter((i) => i.sectionId === s.id);
					return (
						<div key={s.id} className={ui.card}>
							<Form method="post" className="flex items-center gap-2">
								<input type="hidden" name="sectionId" value={s.id} />
								<input name="title" defaultValue={s.title} className={`${ui.inputSm} max-w-xs font-semibold`} />
								<button type="submit" name="intent" value="section-update" className={ui.btnSecondary}>
									Rename
								</button>
								<button
									type="submit"
									name="intent"
									value="section-delete"
									className={ui.btnDanger}
									onClick={(e) => {
										if (!confirm("Delete section? Its items become ungrouped.")) e.preventDefault();
									}}
								>
									Delete section
								</button>
							</Form>
							<div className="mt-3">
								{sectionItems.map((i) => (
									<ItemRow key={i.id} item={i} />
								))}
								<AddItemForm sectionId={s.id} />
								<SectionSubtotal items={sectionItems} />
							</div>
						</div>
					);
				})}

				{/* Ungrouped items */}
				<div className={ui.card}>
					<h3 className="font-semibold">Ungrouped</h3>
					<div className="mt-3">
						{ungrouped.map((i) => (
							<ItemRow key={i.id} item={i} />
						))}
						<AddItemForm sectionId={null} />
						<SectionSubtotal items={ungrouped} />
					</div>
				</div>

				{/* Add section */}
				<AddSectionForm />
			</div>

			{/* Estimated total at target prices (internal) */}
			<div className={`${ui.card} mt-6 flex items-baseline justify-between`}>
				<span className="text-sm text-gray-600">
					Estimated total at target prices <span className="text-gray-400">(internal estimate)</span>
				</span>
				<span className="text-xl font-bold tabular-nums">{formatMoney(grandEst)}</span>
			</div>

			<Form method="post" className="mt-10 border-t border-gray-200 pt-4">
				<button
					type="submit"
					name="intent"
					value="rfq-delete"
					className={ui.btnDanger}
					onClick={(e) => {
						if (!confirm("Delete this entire RFQ?")) e.preventDefault();
					}}
				>
					Delete RFQ
				</button>
			</Form>
		</div>
	);
}
