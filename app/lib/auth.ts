import { createCookie } from "react-router";

// Minimal single-owner auth: one shared password (ADMIN_PASSWORD) sets a signed,
// httpOnly session cookie. Good enough for a solo app. For production you can
// instead front the app with Cloudflare Access (zero code) — see README.

function sessionCookie(env: Env, secure = true) {
	return createCookie("mg_session", {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		secure,
		maxAge: 60 * 60 * 24 * 30,
		secrets: [env.COOKIE_SECRET || "dev-insecure-secret-change-me"],
	});
}

export async function isAuthed(env: Env, request: Request): Promise<boolean> {
	const value = await sessionCookie(env).parse(request.headers.get("Cookie"));
	return value?.auth === true;
}

export function checkPassword(env: Env, password: string): boolean {
	const expected = env.ADMIN_PASSWORD || "";
	return expected.length > 0 && password === expected;
}

export async function loginHeader(env: Env, request: Request): Promise<string> {
	const secure = new URL(request.url).protocol === "https:";
	return sessionCookie(env, secure).serialize({ auth: true });
}

export async function logoutHeader(env: Env, request: Request): Promise<string> {
	const secure = new URL(request.url).protocol === "https:";
	return sessionCookie(env, secure).serialize({ auth: false }, { maxAge: 0 });
}
