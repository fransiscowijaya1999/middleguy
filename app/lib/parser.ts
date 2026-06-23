import { z } from "zod";

// Vendor-invoice parser. Kept behind this module so the implementation can be
// swapped (e.g. to the Claude API) without touching callers.
//
// Implementation: Workers AI (free).
//   1. Turn each part into Markdown text via env.AI.toMarkdown(). This handles
//      PDFs/docs AND images — toMarkdown OCRs an image into a Markdown table
//      (wrapped in a short prose caption that the extraction step ignores). We
//      do NOT use a vision model: @cf/meta/llama-3.2-11b-vision-instruct is gated
//      behind a one-time license-acceptance step (AiError 5016) and toMarkdown's
//      OCR is both ungated and higher quality for tabular invoices.
//   2. A small Llama model extracts structured line items from the combined text.
//   3. Zod validates; anything unparseable falls back to empty lines + raw text
//      so the owner can fill it in by hand (free models are rough — always
//      reviewed before sending).

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT = `You extract line items from a vendor invoice provided as Markdown/OCR text.
Return ONLY a JSON object of this exact shape, with no commentary:
{"lines":[{"name":string,"qty":number,"unit":string,"unitPrice":number}],"total":number|null}
- unitPrice is the price for ONE unit, not the line total.
- All numbers must be plain: no currency symbols, no thousands separators.
- If a field is unknown, use "" for strings and your best estimate for numbers.`;

const ParsedSchema = z.object({
	lines: z.array(
		z.object({
			name: z.string(),
			qty: z.number(),
			unit: z.string().optional(),
			unitPrice: z.number(),
		}),
	),
	total: z.number().nullable().optional(),
});

export type ParsedLine = {
	name: string;
	qty: number;
	unit: string;
	unitPrice: number;
};

export type ParsedInvoice = {
	lines: ParsedLine[];
	total: number | null;
	/** The raw markdown/OCR text, kept for audit and manual fallback. */
	raw: string;
};

// The AI binding's types lag the runtime, so use a narrow local shape.
type AiLike = {
	toMarkdown: (
		docs: { name: string; blob: Blob }[],
	) => Promise<Array<{ name: string; data: string }>>;
	run: (model: string, input: unknown) => Promise<{ response?: unknown } | string>;
};

// Turn one invoice part (PDF, doc, or image) into Markdown text. Returns "" on
// failure so the rest of the invoice (other parts) still parses.
async function toText(ai: AiLike, file: File, i: number): Promise<string> {
	try {
		const md = await ai.toMarkdown([{ name: file.name || `invoice-${i + 1}`, blob: file }]);
		return md?.[0]?.data ?? "";
	} catch (err) {
		console.warn(`[parser] toMarkdown failed for part ${i + 1} (${file.name}):`, err);
		return "";
	}
}

// Convert every invoice part to Markdown text, aligned 1:1 with `files`.
//
// We send all parts in a SINGLE toMarkdown call (its documented multi-doc API).
// The previous code fired one call per file via Promise.all — those run
// concurrently, hit Workers AI's concurrency/rate limits, and the error was
// swallowed to "", so every part after the first vanished and only the first
// file ever got parsed. One batched call avoids that; if it throws we retry
// SEQUENTIALLY (never concurrently) so a single bad part can't drop the rest.
async function toTexts(ai: AiLike, files: File[]): Promise<string[]> {
	const docs = files.map((f, i) => ({ name: f.name || `invoice-${i + 1}`, blob: f }));
	try {
		const md = await ai.toMarkdown(docs);
		const byName = new Map(md.map((m) => [m.name, m.data]));
		// Prefer matching by the name we sent; fall back to positional order.
		const out = docs.map((d, i) => byName.get(d.name) ?? md?.[i]?.data ?? "");
		if (out.some((t) => t.trim())) return out;
	} catch (err) {
		console.warn("[parser] batched toMarkdown failed, retrying sequentially:", err);
	}
	const out: string[] = [];
	for (let i = 0; i < files.length; i++) out.push(await toText(ai, files[i], i));
	return out;
}

function extractJson(text: string): unknown {
	if (!text) return null;
	let t = text.trim();
	t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
	const start = t.indexOf("{");
	const end = t.lastIndexOf("}");
	if (start === -1 || end === -1 || end < start) return null;
	try {
		return JSON.parse(t.slice(start, end + 1));
	} catch {
		return null;
	}
}

export async function parseInvoice(
	env: Env,
	files: File | File[],
): Promise<ParsedInvoice> {
	const ai = env.AI as unknown as AiLike;
	// A vendor invoice may arrive split across several photos/PDFs. We turn each
	// part into Markdown via toMarkdown (which OCRs images too), then concatenate
	// and extract line items once over the combined invoice so parts merge into
	// one item list.
	const list = (Array.isArray(files) ? files : [files]).filter((f) => f.size > 0);
	if (list.length === 0) return { lines: [], total: null, raw: "" };

	const texts = await toTexts(ai, list);
	console.log(
		"[parser] parts:",
		list.map((f, i) => `${f.name || `part ${i + 1}`} (${f.size}b) -> ${texts[i]?.length ?? 0} chars`),
	);
	const partLabel = (f: File, i: number) => f.name || `Part ${i + 1}`;
	const raw = list
		.map((f, i) =>
			list.length > 1 ? `--- ${partLabel(f, i)} ---\n${texts[i]}` : texts[i],
		)
		.join("\n\n")
		.trim();
	if (!raw.trim()) return { lines: [], total: null, raw };

	// Build the model input with a PER-PART budget. A single global slice lets a
	// large first part (e.g. one image's OCR) consume the whole window, so the
	// remaining parts of a multi-image invoice never reach the model and go
	// unparsed. Splitting the budget guarantees every part is represented.
	const TOTAL_BUDGET = 24000;
	const perPart = Math.max(2000, Math.floor(TOTAL_BUDGET / list.length));
	const modelInput = list
		.map((f, i) => {
			const head = list.length > 1 ? `--- ${partLabel(f, i)} ---\n` : "";
			return head + (texts[i] ?? "").slice(0, perPart);
		})
		.join("\n\n")
		.trim();

	let payload: unknown = null;
	try {
		const resp = await ai.run(MODEL, {
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: modelInput },
			],
			// Without this, Workers AI caps output at ~256 tokens and truncates the
			// JSON mid-array on any multi-line invoice, so extraction returns nothing.
			max_tokens: 8192,
		});
		// The model's answer lands in `response`. Workers AI returns it as a raw
		// string when the model wraps it (e.g. in a ```json fence) but as an
		// already-parsed object when the model emits bare JSON — so handle both.
		const value = typeof resp === "string" ? resp : resp.response;
		payload = typeof value === "string" ? extractJson(value) : value;
	} catch {
		return { lines: [], total: null, raw };
	}

	const validated = ParsedSchema.safeParse(payload);
	if (!validated.success) {
		console.warn("[parser] model output failed validation:", JSON.stringify(payload)?.slice(0, 500));
		return { lines: [], total: null, raw };
	}
	console.log(`[parser] extracted ${validated.data.lines.length} line(s) from ${list.length} part(s)`);

	return {
		lines: validated.data.lines.map((l) => ({
			name: l.name,
			qty: l.qty,
			unit: l.unit ?? "",
			unitPrice: l.unitPrice,
		})),
		total: validated.data.total ?? null,
		raw,
	};
}
