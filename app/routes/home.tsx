import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "middleguy" },
		{ name: "description", content: "Middleman invoice tool" },
	];
}

export default function Home() {
	return (
		<main className="container mx-auto p-8">
			<h1 className="text-2xl font-bold">middleguy</h1>
			<p className="text-gray-600">
				Scaffold ready. Dashboard and invoice flow coming next.
			</p>
		</main>
	);
}
