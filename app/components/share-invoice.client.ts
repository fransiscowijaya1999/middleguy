import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

// Client-only (`.client.ts`): excluded from the SSR/Worker bundle, so jsPDF and
// html-to-image never ship to the edge. Renders the invoice node to a single-page
// PDF and shares it as a file attachment (WhatsApp, etc.), falling back to download.
export async function shareInvoicePdf(
	node: HTMLElement,
	fileName: string,
	title: string,
): Promise<void> {
	const ratio = 2;
	const dataUrl = await toPng(node, { pixelRatio: ratio, backgroundColor: "#ffffff" });
	const img = new Image();
	img.src = dataUrl;
	await img.decode();
	const w = img.width / ratio;
	const h = img.height / ratio;
	const pdf = new jsPDF({
		orientation: w >= h ? "landscape" : "portrait",
		unit: "px",
		format: [w, h],
	});
	pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
	const blob = pdf.output("blob");
	const file = new File([blob], fileName, { type: "application/pdf" });

	const nav = navigator as Navigator & {
		canShare?: (data?: { files?: File[] }) => boolean;
	};
	if (nav.canShare?.({ files: [file] })) {
		await nav.share({ files: [file], title });
	} else {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(url);
	}
}
