import { NavLink, Outlet } from "react-router";

const navItems = [
	{ to: "/", label: "Dashboard", end: true },
	{ to: "/vendors", label: "Vendors" },
	{ to: "/partners", label: "Partners" },
	{ to: "/rfqs", label: "RFQs" },
	{ to: "/settings", label: "Settings" },
];

export default function Layout() {
	return (
		<div className="min-h-screen bg-gray-50 text-gray-900">
			<header className="border-b border-gray-200 bg-white">
				<div className="container mx-auto flex items-center gap-6 px-6 py-3">
					<span className="text-lg font-bold tracking-tight">middleguy</span>
					<nav className="flex gap-1">
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
				</div>
			</header>
			<main className="container mx-auto px-6 py-8">
				<Outlet />
			</main>
		</div>
	);
}
