import { Form, redirect } from "react-router";
import { checkPassword, isAuthed, loginHeader } from "~/lib/auth";
import { ui } from "~/lib/ui";
import type { Route } from "./+types/login";

export function meta(_: Route.MetaArgs) {
	return [{ title: "Sign in · middleguy" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
	if (await isAuthed(context.cloudflare.env, request)) throw redirect("/");
	return null;
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	const form = await request.formData();
	const password = String(form.get("password") ?? "");
	if (!checkPassword(env, password)) {
		return { error: "Incorrect password." };
	}
	return redirect("/", {
		headers: { "Set-Cookie": await loginHeader(env, request) },
	});
}

export default function Login({ actionData }: Route.ComponentProps) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
			<div className="w-full max-w-sm">
				<h1 className="text-center text-2xl font-bold">middleguy</h1>
				<p className="mt-1 text-center text-sm text-gray-600">Sign in to continue.</p>
				<Form method="post" className={`${ui.card} mt-6 space-y-3`}>
					{actionData?.error && <div className={ui.error}>{actionData.error}</div>}
					<div>
						<label className={ui.label} htmlFor="password">
							Password
						</label>
						<input
							id="password"
							name="password"
							type="password"
							autoComplete="current-password"
							className={ui.input}
						/>
					</div>
					<button type="submit" className={`${ui.btnPrimary} w-full justify-center`}>
						Sign in
					</button>
				</Form>
			</div>
		</div>
	);
}
