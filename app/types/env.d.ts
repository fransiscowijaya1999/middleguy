// App-provided secrets/vars (set via .dev.vars locally, `wrangler secret put`
// in production). Merged into the global Env that `wrangler types` generates.
interface Env {
	ADMIN_PASSWORD: string;
	COOKIE_SECRET: string;
}
