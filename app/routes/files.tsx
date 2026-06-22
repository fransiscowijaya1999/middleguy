import type { Route } from "./+types/files";

/** Stream a stored object out of R2 by key (used for the logo, vendor files). */
export async function loader({ params, context }: Route.LoaderArgs) {
	const key = params["*"];
	if (!key) throw new Response("Not found", { status: 404 });

	const object = await context.cloudflare.env.FILES.get(key);
	if (!object) throw new Response("Not found", { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/octet-stream");
	}
	headers.set("cache-control", "private, max-age=3600");
	return new Response(object.body, { headers });
}
