# AGENTS.md

## What this is

Blunter Bills is a single-user personal finance app. The web app talks only to
the Fastify API. The API uses two backend-only workspace packages to reach
Enable Banking and Gmail. The browser never calls either provider directly.

## Layout

- `apps/api` — Fastify + TypeScript: bank/mail auth flows, repositories, HTTP API.
- `apps/web` — Vite + React 19 + React Compiler + Tailwind v4 SPA; atomic
  components under `src/components/{atoms,molecules,organisms,templates}`.
- `packages/enable-banking` — standalone Enable Banking SDK; owns JWT signing and
  the upstream client.
- `packages/mail` — provider-agnostic `MailReader` port with a Gmail adapter;
  owns Google OAuth helpers and Gmail/MIME parsing.

## Commands

Node 24 via `nvm use`; pnpm. Run from the repo root unless noted.

```bash
pnpm install
pnpm dev            # API :3000 + web :5173
pnpm dev:api
pnpm dev:web
pnpm typecheck      # all packages, including tests
pnpm test           # all suites; no credentials or network
pnpm build          # SDKs -> API -> web; required before API start
pnpm format
pnpm format:check
```

Focused checks: `pnpm --filter @blunter-bills/api test` (same pattern for
`enable-banking` and `mail`).

## Setup pointers

- Full local setup (Enable Banking, Google Cloud, env, redirects): `docs/SETUP.md`
- API usage and endpoints: `apps/api/README.md`
- Mail reader usage and errors: `packages/mail/README.md`
- SDK methods and errors: `packages/enable-banking/README.md`

## Secrets and state

- `apps/api/.env` and `packages/mail/.env` are gitignored; templates are
  `*.env.example`.
- Gmail web-flow credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI`) belong in `apps/api/.env`. `packages/mail/.env` is only
  for the standalone CLI scripts.
- The Enable Banking private key lives outside the repo, referenced by
  `ENABLE_BANKING_PRIVATE_KEY_PATH`.
- `apps/api/.data/store.json` (mode `0600`) holds the bank session and the Gmail
  refresh token. Never commit or log it.
- Never commit `.env`, `.data/`, `*.pem`, `*.key`, or `*.crt`.
- `FRONTEND_URL` must match the web origin (default `http://localhost:5173`).
- `SERVICE_API_KEY` is optional; the Vite proxy injects it server-side. Public
  paths: `/health`, `/auth/callback`, `/mail/gmail/callback`.
- `ENABLE_BANKING_REDIRECT_URL` and `GOOGLE_REDIRECT_URI` must exactly match the
  URLs registered in the provider consoles.
- Refresh/access tokens stay server-side; the browser only receives connection
  status.

## Boundaries and invariants

- The web app must not import `@blunter-bills/enable-banking` or
  `@blunter-bills/mail`; both are backend-only.
- Enable Banking JWT logic belongs in the SDK. The API gets its client from
  `apps/api/src/enable-banking.ts`.
- Gmail/OAuth/MIME logic belongs in `@blunter-bills/mail`; new mail providers
  implement `MailReader`.
- Routes depend on `SessionRepository` / `MailRepository`
  (`apps/api/src/repositories/contracts.ts`), never the file adapter directly.
  Inject via `buildApp({ repositories })`; keep `store.json` backward compatible
  when changing persistence.
- Single-user service: one bank session and one mailbox connection at a time.
  Re-running bank auth replaces the stored session.
- Bank auth flow: `POST /auth` -> bank redirect -> `GET /auth/callback` ->
  `/setup/mail`. The mail callback (`GET /mail/gmail/callback`) stores the Gmail
  refresh token.
- Google Testing-mode refresh tokens expire after 7 days; a Workspace Internal
  app avoids that.
- The mail reader is read-only, returns best-effort plain text, clamps
  `maxResults` to 100, and has no send/label/attachment support.
- Current status: bank auth/session/transactions and mailbox connection exist;
  the dashboard is still a welcome screen and bill scanning is not wired.

## API surface

```text
GET    /health
GET    /aspsps?country=XX
POST   /auth
GET    /auth/callback
GET    /session
DELETE /session
GET    /accounts
GET    /transactions
GET    /mail/status
POST   /mail/gmail/start
GET    /mail/gmail/callback
DELETE /mail
```

## Transactions

- `from` / `to` are inclusive `YYYY-MM-DD`; `to` defaults to today UTC and
  future dates are clamped.
- `days` defaults to 5 when `from` is omitted (1–365).
- `account_id` defaults to the first account; `raw=true` returns the Enable
  Banking payload.
- Normalized `amount` is signed: debits negative. `date` is `booking_date`,
  falling back to `value_date` then `transaction_date`.
- Enable Banking pagination is followed (up to 20 pages) and results are also
  date-filtered locally.

## Testing

- API integration tests inject in-memory repositories plus fake Enable Banking
  and Gmail clients (`apps/api/test/fixtures`).
- SDK tests use in-process HTTP mocks and throwaway keys; no network or real
  credentials.
- Add tests for every route, repository, SDK adapter, or parser change.
  Minimum gate: `pnpm typecheck` and `pnpm test`. Run `pnpm build` for
  cross-package changes.

## Web

- Vite proxies `/api` to the API at `:3000`. Client: `apps/web/src/lib/api.ts`.
- Routes: `/`, `/auth/callback`, `/setup/mail`, `/dashboard`.
- React Compiler is enabled; write plain components and avoid manual memoization
  unless measured.
