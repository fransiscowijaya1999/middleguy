# middleguy

A simple middleman / dropshipping invoice tool. Upload a vendor's invoice, parse
it into line items, mark it up (per-line), and send a clean customer-facing
invoice — **without revealing your vendor or your margin**. Privately track
payments, shipping costs, profit, and goods reconciliation.

Built on **Cloudflare** (one vendor, mostly free): React Router v7 on Workers,
D1 (database), R2 (file storage), KV (share links), Workers AI (parsing).
Package manager / tests: **Bun**. See `CLAUDE.md` for conventions.

## Local development

```bash
bun install
cp .dev.vars.example .dev.vars      # then edit ADMIN_PASSWORD / COOKIE_SECRET
bun run db:migrate:local            # apply the schema to the local D1
bun run dev                         # http://localhost:5173
```

Other scripts: `bun test` (pricing logic), `bun run typecheck`, `bun run build`,
`bun run db:generate` (after editing `app/db/schema.ts`).

## Deploy to Cloudflare

You need a Cloudflare account. Authenticate once:

```bash
bunx wrangler login
```

1. **Create the resources** (names match `wrangler.json`):

   ```bash
   bunx wrangler d1 create middleguy
   bunx wrangler r2 bucket create middleguy-files
   bunx wrangler kv namespace create SHARE_LINKS
   ```

2. **Paste the returned IDs** into `wrangler.json`, replacing the
   `REPLACE_WITH_REAL_ID_ON_DEPLOY` placeholders for `d1_databases[0].database_id`
   and `kv_namespaces[0].id`.

3. **Set the secrets:**

   ```bash
   bunx wrangler secret put ADMIN_PASSWORD
   bunx wrangler secret put COOKIE_SECRET     # a long random string
   ```

4. **Run the schema migration on the remote DB, then deploy:**

   ```bash
   bun run db:migrate:remote
   bun run deploy
   ```

Your app is live at `https://middleguy.<your-subdomain>.workers.dev` (or add a
custom domain in the Cloudflare dashboard).

## Notes

- **Auth:** the admin app is gated by a single password (`ADMIN_PASSWORD`). The
  customer pages (`/i/:token`) and the logo (`/files/*`) are intentionally public.
  Production alternative: put **Cloudflare Access** in front of everything except
  `/i/*` and `/files/*` for zero-code SSO, and remove the password gate.
- **AI parser:** parsing uses Workers AI and runs against Cloudflare's API, so it
  only works once deployed (or with `wrangler` authenticated). If parsing fails or
  is skipped, the invoice is still created with no lines and you add them by hand —
  you always review parsed data before sending anyway.
- **Cost:** everything fits Cloudflare's free tiers for a solo app. The only
  metered piece is Workers AI beyond the free daily allotment (cents).
