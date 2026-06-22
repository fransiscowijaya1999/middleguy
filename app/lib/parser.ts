import { z } from "zod";

// Vendor-invoice parser. Kept behind this module so the implementation can be
// swapped (e.g. to the Claude API) without touching callers.
//
// Implementation: Workers AI (free).
//   1. env.AI.toMarkdown() turns a PDF/image into text (OCR for images).
//   2. A small Llama model extracts structured line items.
//   3. Zod validates; anything unparseable falls back to empty lines + raw text
//      so the owner can fill it in by hand (free models are rough — always
//      reviewed before sending).

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

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
	run: (model: string, input: unknown) => Promise<{ response?: string } | string>;
};

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
	file: File,
): Promise<ParsedInvoice> {
	const ai = env.AI as unknown as AiLike;

	let raw = "";
	try {
		const md = await ai.toMarkdown([{ name: file.name || "invoice", blob: file }]);
		raw = md?.[0]?.data ?? "";
	} catch {
		return { lines: [], total: null, raw: "" };
	}
	if (!raw.trim()) return { lines: [], total: null, raw };

	let text = "";
	try {
		const resp = await ai.run(MODEL, {
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: raw.slice(0, 12000) },
			],
		});
		text = typeof resp === "string" ? resp : (resp.response ?? "");
	} catch {
		return { lines: [], total: null, raw };
	}

	const validated = ParsedSchema.safeParse(extractJson(text));
	if (!validated.success) return { lines: [], total: null, raw };

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
