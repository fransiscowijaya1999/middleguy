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
		route("settings", "routes/settings.tsx"),
	]),
	// Resource route: stream files (e.g. the logo) out of R2.
	route("files/*", "routes/files.tsx"),
] satisfies RouteConfig;
