# @blunter-bills/api

Fastify + TypeScript backend for Blunter Bills. It owns bank/mail authorization,
the stored session, repository-backed persistence, and the HTTP API used by the
web app. Enable Banking and Gmail calls go through the workspace SDKs.

Credentials and OAuth setup: [`docs/SETUP.md`](../../docs/SETUP.md).

## Quick start

From the repo root:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
# Fill in the values documented in docs/SETUP.md
pnpm --filter @blunter-bills/api dev
```

The API listens on <http://localhost:3000> by default.

## Usage

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/aspsps?country=FI"

curl -X POST http://localhost:3000/auth \
  -H 'content-type: application/json' \
  -d '{"aspsp_name":"Nordea","aspsp_country":"FI","psu_type":"personal","return_url":"http://localhost:5173/auth/callback"}'

curl "http://localhost:3000/transactions?days=5"
```

`POST /auth` returns a consent URL. When `return_url` is supplied, the callback
redirects the browser to it with `?auth=success` or `?auth=error&message=...`.

## Endpoints

| Method   | Path                   | Purpose                                           |
| -------- | ---------------------- | ------------------------------------------------- |
| `GET`    | `/health`              | Liveness plus configuration/session status        |
| `GET`    | `/aspsps?country=FI`   | Banks available to the application                |
| `POST`   | `/auth`                | Start bank authorization, returns redirect URL    |
| `GET`    | `/auth/callback`       | OAuth redirect target; exchanges code for session |
| `GET`    | `/session`             | Show the stored session                           |
| `DELETE` | `/session`             | Revoke the session upstream and locally           |
| `GET`    | `/accounts`            | Accounts exposed by the session                   |
| `GET`    | `/transactions`        | Date-filtered transaction list                    |
| `GET`    | `/mail/status`         | Gmail configured/connected status                 |
| `POST`   | `/mail/gmail/start`    | Start Gmail consent, returns the Google URL       |
| `GET`    | `/mail/gmail/callback` | Gmail OAuth redirect; stores the refresh token    |
| `DELETE` | `/mail`                | Disconnect the stored mailbox                     |

## Transactions

- `from` / `to` are inclusive `YYYY-MM-DD`; `to` defaults to today UTC and
  future dates are clamped.
- `days` defaults to 5 when `from` is omitted (1–365).
- `account_id` defaults to the first account; `raw=true` returns the Enable
  Banking payload.
- Normalized `amount` is signed: debits negative. `date` is `booking_date`,
  falling back to `value_date` then `transaction_date`.
- Pagination is followed (up to 20 pages) and results are also date-filtered
  locally.

## Configuration

`apps/api/.env` is gitignored; start from `.env.example`. The full variable
reference is in [`docs/SETUP.md`](../../docs/SETUP.md).

- The file adapter writes `DATA_DIR/store.json` with mode `0600`.
- The Enable Banking private key belongs outside the repo.
- `FRONTEND_URL` must match the web origin.
- `SERVICE_API_KEY` is optional. The Vite proxy injects it server-side; public
  paths are `/health`, `/auth/callback`, and `/mail/gmail/callback`.

## Architecture

- Routes depend on `SessionRepository` and `MailRepository`
  (`src/repositories/contracts.ts`), not on the file adapter directly.
- `app.ts` defaults to `createFileRepositories(config.dataDir)`; a database
  adapter can be injected with `buildApp({ repositories })`.
- The Enable Banking client comes from `src/enable-banking.ts`.
- This is a single-user service: one bank session and one mailbox at a time.

## Testing

```bash
pnpm --filter @blunter-bills/api test
pnpm --filter @blunter-bills/api typecheck
```

The suite uses an injected fake Enable Banking client, a fake Gmail OAuth
service, and in-memory repositories. No credentials or network access are
required. Run `pnpm build` from the repo root to build the API with the workspace
packages.
