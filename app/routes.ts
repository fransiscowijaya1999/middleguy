import {
	type RouteConfig,
	index,
	layout,
	route,
} from "@react-router/dev/routes";

export default [
	layout("routes/layout.tsx", [
		index("routes/home.tsx"),
		route("vendors", "routes/vendors.tsx"),
		route("vendors/:id", "routes/vendors.$id.tsx"),
		route("partners", "routes/partners.tsx"),
		route("partners/:id", "routes/partners.$id.tsx"),
		route("rfqs", "routes/rfqs.tsx"),
		route("rfqs/:id", "routes/rfqs.$id.tsx"),
		route("invoices", "routes/invoices.tsx"),
		route("invoices/:id", "routes/invoices.$id.tsx"),
		route("settings", "routes/settings.tsx"),
	]),
	// Auth (outside the protected layout).
	route("login", "routes/login.tsx"),
	route("logout", "routes/logout.tsx"),
	// Public, read-only customer invoice (no admin layout).
	route("i/:token", "routes/i.$token.tsx"),
	// Resource route: stream files (e.g. the logo) out of R2.
	route("files/*", "routes/files.tsx"),
] satisfies RouteConfig;
