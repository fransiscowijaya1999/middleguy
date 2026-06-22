// Small helpers for reading values out of a submitted FormData.

export function toNum(v: FormDataEntryValue | null, def = 0): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : def;
}

export function toNullNum(v: FormDataEntryValue | null): number | null {
	const s = String(v ?? "").trim();
	if (!s) return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

export function toNullId(v: FormDataEntryValue | null): number | null {
	const s = String(v ?? "").trim();
	return s ? Number(s) : null;
}

export function toBool(v: FormDataEntryValue | null): boolean {
	const s = String(v ?? "").toLowerCase();
	return s === "on" || s === "true" || s === "1";
}

export function safeFileName(name: string): string {
	return (name || "file").replace(/[^a-zA-Z0-9.\-_]/g, "_");
}
