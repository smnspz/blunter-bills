# Blunter Bills

A small personal finance app: a Fastify API that wraps [Enable Banking](https://enablebanking.com/docs/api/reference/), and a React dashboard. Brutalist on purpose: thick borders, monospace, no mascots.

## Structure

```
blunter-bills/
  apps/
    api/   Fastify + TypeScript Enable Banking wrapper
    web/   Vite + React 19 + React Compiler + Tailwind v4 SPA
```

The API owns the Enable Banking JWT, the bank authorization flow, the stored
session, and the transaction endpoints. The web app only talks to the API.

## Quick start

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
# fill in ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY_PATH
pnpm dev
```

- API: <http://localhost:3000>
- Web: <http://localhost:5173>

The Vite dev server proxies `/api` to the API. If `SERVICE_API_KEY` is set in
`apps/api/.env`, the proxy injects it server-side, so the browser never sees the
key.

## Flow

1. `/` shows the bank picker (country + search + bank).
2. Selecting a bank calls `POST /api/auth` with `return_url` set to the web
   app's `/auth/callback`.
3. The browser is redirected to Enable Banking and then to the bank's own SCA.
4. The bank returns to the API's `ENABLE_BANKING_REDIRECT_URL`; the API
   exchanges the code and stores the session.
5. With `return_url` set, the API redirects to the web app's `/auth/callback`,
   which sends you to `/dashboard`.

The dashboard is intentionally a welcome screen for now. Transactions and
filters are the next step.

## Scripts

```bash
pnpm dev            # API + web in parallel
pnpm dev:api
pnpm dev:web
pnpm build
pnpm typecheck
pnpm test           # API unit + integration tests
pnpm format
pnpm format:check
```

## Notes

- Node.js >= 24 (pinned in `.nvmrc`).
- The Enable Banking private key belongs outside this repo. The app reads it
  through `ENABLE_BANKING_PRIVATE_KEY_PATH`.
- `FRONTEND_URL` in `apps/api/.env` must match the origin you open the web app
  from. Defaults to `http://localhost:5173`; change it if you test from another
  host on your LAN.
- `SERVICE_API_KEY` protects the API routes; `/health` and `/auth/callback`
  stay public so the browser redirect can complete.
- For a LAN test from a phone, the bank's redirect URL must also be reachable
  from that phone. An HTTPS tunnel is the simplest option.

See [`apps/api/README.md`](apps/api/README.md) for the Enable Banking setup and
API details.
