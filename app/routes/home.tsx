import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
	return [
		{ title: "middleguy" },
		{ name: "description", content: "Middleman invoice tool" },
	];
}

export default function Home() {
	return (
		<div>
			<h1 className="text-2xl font-bold">Dashboard</h1>
			<p className="mt-1 text-gray-600">
				Parse a vendor invoice, mark it up, and send a clean customer-facing
				invoice.
			</p>
			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Link
					to="/settings"
					className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm"
				>
					<div className="font-semibold">Settings</div>
					<div className="text-sm text-gray-600">
						Business name, logo, and default markup.
					</div>
				</Link>
			</div>
		</div>
	);
}
