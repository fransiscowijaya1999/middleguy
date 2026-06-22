import { redirect } from "react-router";
import { logoutHeader } from "~/lib/auth";
import type { Route } from "./+types/logout";

export async function loader() {
	throw redirect("/");
}

export async function action({ request, context }: Route.ActionArgs) {
	return redirect("/login", {
		headers: { "Set-Cookie": await logoutHeader(context.cloudflare.env, request) },
	});
}
