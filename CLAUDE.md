# middleguy

Solo middleman/dropshipping invoice tool. The owner buys supply from a vendor on
behalf of a partner/friend **without revealing the vendor or the markup**. Flow:
make an RFQ → vendor sends an invoice → upload & parse it → mark it up → send a
clean customer-facing invoice → track payments/shipping → reconcile goods → settle.

## Stack
- React Router v7 (SSR) on Cloudflare Workers (`@cloudflare/vite-plugin`).
- D1 (SQLite) via Drizzle ORM. R2 for invoice files. KV for share-link tokens. Workers AI for parsing.
- Tailwind v4. TypeScript. **Bun** = package manager / script runner / test runner.
  (The app still *runs* on Cloudflare `workerd`, not on the Bun runtime.)

## Commands (use bun)
- `bun run dev` — local dev (Vite + workerd; D1/R2/KV are simulated locally).
- `bun run build` / `bun run typecheck` / `bun run check`.
- `bun test` — unit tests (the pricing logic).
- `bun run db:generate` — generate a D1 migration after editing the schema.
- `bun run db:migrate:local` / `bun run db:migrate:remote` — apply migrations.
- `bun run cf-typegen` — regenerate the `Env` types; **run after changing wrangler.json bindings**.
- `bun run deploy` — deploy to Cloudflare.

## Bindings (wrangler.json → `context.cloudflare.env`)
`DB` (D1), `FILES` (R2), `SHARE_LINKS` (KV), `AI` (Workers AI).
Before first deploy, replace the placeholder `database_id` and KV `id` with real
values (`wrangler d1 create middleguy`, `wrangler kv namespace create SHARE_LINKS`,
`wrangler r2 bucket create middleguy-files`).

## Conventions
- Schema-first: `app/db/schema.ts` (Drizzle) + Zod are the source of truth.
- Loaders read the DB; actions write it. Single-user (owner) admin. The partner only
  ever sees the public, read-only `/i/:token` view.
- Money logic lives in `app/lib/pricing.ts` as **pure functions with tests** — only
  change it alongside its tests.
- Numbers have **no currency symbol**. Always render via `formatMoney(n)` →
  `1,234,567.89` (comma thousands, dot decimal, fixed 2 decimals).

## Pricing rules (core logic — get this right)
- The customer invoice is a **plain ordered list of lines + grand total**. There is
  **no** auto "shipping/handling" line.
- Each line has a `marked_up` toggle: marked lines = `unitPrice*(1+margin%)`; others
  pass through at their entered amount.
- `customerTotal = Σ qty * (marked_up ? unitPrice*(1+margin%) : unitPrice)`.
- Private (owner only): `profit = customerTotal − vendorGoodsCost − shippingPaid`,
  where `vendorGoodsCost = Σ qty*unitPrice` of parsed lines (`is_manual=false`) and
  `shippingPaid = Σ shipping_cost.amount`.
- `shipping_cost` is an **internal cost log only** — never shown to the customer and
  never auto-added as a line. The owner manually adds a shipping line (usually
  `marked_up=false`) if they want to charge for it.
- The customer never sees cost, margin %, or the shipping log.

## Invoice status (owner flips manually; partner agrees in chat)
`draft → sent → accepted → partner_paid → vendor_paid → received → settled`
(+ `cancelled`). At `received`, enter `received_qty` per line; flag mismatches.

## Parser
`app/lib/parser.ts` exposes `parseInvoice(file) → ParsedInvoice` behind an interface.
Implementation: Workers AI `env.AI.toMarkdown()` → text model → Zod-validated JSON.
Free but rough — always owner-reviewed before sending. Swappable to the Claude API
later without touching callers.
