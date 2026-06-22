import { redirect } from "react-router";
import { InvoiceDocument } from "~/components/invoice-document";
import { getDb } from "~/db/client";
import { isAuthed } from "~/lib/auth";
import { getCustomerInvoiceData } from "~/lib/customer-invoice";
import type { Route } from "./+types/invoices.$id.print";

export function meta({ data }: Route.MetaArgs) {
	const num = data?.invoice.number;
	return [{ title: num ? `Print · ${num}` : "Print invoice" }];
}

export async function loader({ params, context, request }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	if (!(await isAuthed(env, request))) throw redirect("/login");

	const data = await getCustomerInvoiceData(getDb(env), Number(params.id));
	if (!data) throw new Response("Not found", { status: 404 });
	return data;
}

export default function InvoicePrint({ loaderData }: Route.ComponentProps) {
	return <InvoiceDocument data={loaderData} />;
}
