import { Form, NavLink, Outlet, redirect } from "react-router";
import { isAuthed } from "~/lib/auth";
import type { Route } from "./+types/layout";

const navItems = [
	{ to: "/", label: "Dashboard", end: true },
	{ to: "/vendors", label: "Vendors" },
	{ to: "/partners", label: "Partners" },
	{ to: "/rfqs", label: "RFQs" },
	{ to: "/invoices", label: "Invoices" },
	{ to: "/settings", label: "Settings" },
];

export async function loader({ context, request }: Route.LoaderArgs) {
	if (!(await isAuthed(context.cloudflare.env, request))) {
		throw redirect("/login");
	}
	return null;
}

export default function Layout() {
	return (
		<div className="min-h-screen bg-gray-50 text-gray-900">
			<header className="border-b border-gray-200 bg-white">
				<div className="container mx-auto flex items-center gap-6 px-6 py-3">
					<span className="text-lg font-bold tracking-tight">middleguy</span>
					<nav className="flex flex-1 gap-1">
						{navItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								end={item.end}
								className={({ isActive }) =>
									`rounded-md px-3 py-1.5 text-sm font-medium ${
										isActive
											? "bg-gray-900 text-white"
											: "text-gray-600 hover:bg-gray-100"
									}`
								}
							>
								{item.label}
							</NavLink>
						))}
					</nav>
					<Form method="post" action="/logout">
						<button type="submit" className="text-sm text-gray-500 hover:text-gray-900">
							Sign out
						</button>
					</Form>
				</div>
			</header>
			<main className="container mx-auto px-6 py-8">
				<Outlet />
			</main>
		</div>
	);
}
