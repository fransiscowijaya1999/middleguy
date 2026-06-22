import { InvoiceDocument } from "~/components/invoice-document";
import { getDb } from "~/db/client";
import { getCustomerInvoiceData } from "~/lib/customer-invoice";
import type { Route } from "./+types/i.$token";

export function meta({ data }: Route.MetaArgs) {
	const biz = data?.business.name ?? "Invoice";
	const num = data?.invoice.number;
	return [{ title: num ? `${biz} · ${num}` : biz }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const token = params.token;
	const idStr = token ? await env.SHARE_LINKS.get(token) : null;
	if (!idStr) throw new Response("Not found", { status: 404 });

	const data = await getCustomerInvoiceData(getDb(env), Number(idStr));
	if (!data) throw new Response("Not found", { status: 404 });
	return data;
}

export default function CustomerInvoice({ loaderData }: Route.ComponentProps) {
	return <InvoiceDocument data={loaderData} />;
}
