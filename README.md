# Enable Banking microservice

A small [Fastify](https://fastify.dev/) + TypeScript service that wraps the
[Enable Banking](https://enablebanking.com/docs/api/reference/) account
information API.

First exposed API: **list transactions for your bank account, filtered by date**
(e.g. the last 5 days).

Because Enable Banking requires a signed JWT and a per-user bank authorization,
this service also owns the authorization flow and persists the resulting
session. You authorize once; after that `/transactions` is a single call.

## Requirements

- Node.js >= 24 (the project pins `24.21.0` in `.nvmrc`)
- pnpm
- An Enable Banking application (sandbox is enough to start)

## 1. Register an Enable Banking application

Enable Banking authenticates your app with a JWT signed by an RSA key. The
matching public certificate is registered with them.

```bash
# 1. Generate a private key (keep this local; never commit it)
openssl genrsa -out private.key 4096

# 2. Generate a self-signed certificate from it
openssl req -new -x509 -days 365 -key private.key -out public.crt \
  -subj "/C=FI/ST=Uusimaa/L=Helsinki/O=ExampleOrganisation/CN=example.com"
```

Then, in the [Enable Banking control panel](https://enablebanking.com/cp/applications):

1. Register a new application, choose **SANDBOX** (or PRODUCTION).
2. Upload `public.crt`.
3. Add the redirect URL this service will use. For local development:
   `http://localhost:3000/auth/callback`.
   It must match `ENABLE_BANKING_REDIRECT_URL` **exactly**.
4. Copy the generated **Application ID** into `ENABLE_BANKING_APP_ID`.

> Sandbox applications are activated automatically. Production applications
> need contractual formalities or whitelisted accounts.

## 2. Install and configure

```bash
pnpm install
cp .env.example .env
```

Fill in at least:

```dotenv
ENABLE_BANKING_APP_ID=your-application-id
ENABLE_BANKING_PRIVATE_KEY_PATH=./private.key
ENABLE_BANKING_REDIRECT_URL=http://localhost:3000/auth/callback
```

The server starts even without credentials (so you can check `/health`), but
`/auth` and `/transactions` will return `503` until they are set.

### Configuration reference

| Variable                           | Required | Default                               | Description                                                                  |
| ---------------------------------- | -------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| `ENABLE_BANKING_APP_ID`            | yes      | –                                     | Application ID from the control panel                                        |
| `ENABLE_BANKING_PRIVATE_KEY`       | one of   | –                                     | Inline PEM key (use `\n` for newlines)                                       |
| `ENABLE_BANKING_PRIVATE_KEY_PATH`  | one of   | –                                     | Path to the PEM private key                                                  |
| `ENABLE_BANKING_REDIRECT_URL`      | yes      | `http://localhost:3000/auth/callback` | Must match the registered redirect URL                                       |
| `ENABLE_BANKING_BASE_URL`          | no       | `https://api.enablebanking.com`       | API base URL                                                                 |
| `ENABLE_BANKING_JWT_AUDIENCE`      | no       | `api.enablebanking.com`               | JWT `aud` claim                                                              |
| `ENABLE_BANKING_ASPSP_NAME`        | no       | –                                     | Default bank name for `POST /auth`                                           |
| `ENABLE_BANKING_ASPSP_COUNTRY`     | no       | –                                     | Default bank country for `POST /auth`                                        |
| `ENABLE_BANKING_ACCESS_VALID_DAYS` | no       | `90`                                  | Requested consent lifetime                                                   |
| `ENABLE_BANKING_TIMEOUT_MS`        | no       | `30000`                               | Upstream request timeout                                                     |
| `PORT` / `HOST`                    | no       | `3000` / `0.0.0.0`                    | HTTP listener                                                                |
| `LOG_LEVEL`                        | no       | `info`                                | Fastify/pino log level                                                       |
| `SERVICE_API_KEY`                  | no       | –                                     | If set, require `Authorization: Bearer <key>` on all routes except `/health` |
| `DATA_DIR`                         | no       | `.data`                               | Where the session is persisted                                               |

**Sandbox vs production:** both use `https://api.enablebanking.com`. The
environment is determined by the application you registered, not by the URL.

## 3. Run

```bash
pnpm dev        # watch mode
pnpm build && pnpm start
pnpm test
pnpm typecheck
pnpm format     # prettier
```

`pnpm test` runs both unit tests and an end-to-end suite that starts an
in-process Enable Banking mock on an ephemeral port, using a throwaway RSA key
and a temporary data directory. No credentials or network access are required.

## 4. Authorize your bank account

### Option A: use the API

1. Find your bank's exact name/country:

   ```bash
   curl "http://localhost:3000/aspsps?country=FI"
   ```

2. Start authorization:

   ```bash
   curl -X POST http://localhost:3000/auth \
     -H 'content-type: application/json' \
     -d '{"aspsp_name":"Nordea","aspsp_country":"FI","psu_type":"personal"}'
   ```

   Response:

   ```json
   {
     "url": "https://auth.enablebanking.com/ais/start?sessionid=...",
     "authorization_id": "...",
     "state": "..."
   }
   ```

3. Open `url` in a browser and authenticate with your bank. Enable Banking
   redirects you to `ENABLE_BANKING_REDIRECT_URL`; the service exchanges the
   code for a session, stores it in `DATA_DIR/store.json`, and returns the
   accounts.

4. Confirm:

   ```bash
   curl http://localhost:3000/session
   curl http://localhost:3000/accounts
   ```

### Option B: use environment defaults

Set `ENABLE_BANKING_ASPSP_NAME` and `ENABLE_BANKING_ASPSP_COUNTRY`, then call
`POST /auth` with an empty body.

## 5. List transactions

```bash
# Last 5 days (default)
curl "http://localhost:3000/transactions"

# Explicit window
curl "http://localhost:3000/transactions?from=2026-11-06&to=2026-11-11"

# Last 30 days, only booked transactions
curl "http://localhost:3000/transactions?days=30&status=BOOK"

# A specific account exposed by the session
curl "http://localhost:3000/transactions?account_id=<uid>&days=5"

# Raw Enable Banking payload if you need fields we do not normalize
curl "http://localhost:3000/transactions?days=5&raw=true"
```

### Query parameters

| Parameter    | Default       | Description                                                   |
| ------------ | ------------- | ------------------------------------------------------------- |
| `from`       | `to - days`   | Start date, inclusive (`YYYY-MM-DD`)                          |
| `to`         | today (UTC)   | End date, inclusive; future dates are clamped to today        |
| `days`       | `5`           | Window size when `from` is omitted (1–365)                    |
| `account_id` | first account | Account UID from `GET /accounts`                              |
| `status`     | –             | `BOOK`, `PDNG`, `HOLD`, `CNCL`, `RJCT`, `SCHD`, `OTHR`        |
| `raw`        | `false`       | Return Enable Banking transactions instead of normalized ones |

### Response (normalized)

```json
{
  "account_id": "07cc67f4-45d6-494b-adac-09b5cbc7e2b5",
  "iban": "FI0455231152453547",
  "from": "2026-11-06",
  "to": "2026-11-11",
  "count": 2,
  "truncated": false,
  "transactions": [
    {
      "id": "txn_01HV9P3K...",
      "date": "2026-11-10",
      "amount": -49.9,
      "currency": "EUR",
      "direction": "debit",
      "status": "BOOK",
      "counterparty": "K-Market Tapiola",
      "description": "Card payment 10.11.2026 K-Market Tapiola",
      "reference": null,
      "balance_after": 1240.12
    }
  ]
}
```

`amount` is signed: debits are negative, credits positive. `date` is the
`booking_date`, falling back to `value_date` then `transaction_date`.

## API summary

| Method   | Path                 | Purpose                                           |
| -------- | -------------------- | ------------------------------------------------- |
| `GET`    | `/health`            | Liveness plus configuration/session status        |
| `GET`    | `/aspsps?country=FI` | Banks available to the application                |
| `POST`   | `/auth`              | Start bank authorization, returns redirect URL    |
| `GET`    | `/auth/callback`     | OAuth redirect target; exchanges code for session |
| `GET`    | `/session`           | Show the stored session                           |
| `DELETE` | `/session`           | Revoke the session upstream and locally           |
| `GET`    | `/accounts`          | Accounts exposed by the session                   |
| `GET`    | `/transactions`      | Date-filtered transaction list                    |

## How it works

- Every Enable Banking request carries a cached RS256 JWT
  (`kid` = app ID, `iss` = `enablebanking.com`).
- `POST /auth` generates a `state`, asks Enable Banking for a redirect URL, and
  remembers the state for 15 minutes.
- `GET /auth/callback` verifies `state`, calls `POST /sessions` with the
  returned `code`, and persists `session_id` + account UIDs + bank metadata.
- `GET /transactions` uses the stored session, follows `continuation_key`
  pagination (up to 20 pages), and filters locally by date as well — some
  sandbox banks ignore the upstream date filter.
- The session is stored in `${DATA_DIR}/store.json` with mode `0600`.

This is a single-user service: one stored session at a time. Re-running
`POST /auth` and completing the flow replaces it.

## Project layout

```
src/
  server.ts                 entry point, graceful shutdown
  app.ts                    Fastify instance, auth hook, error mapping
  config.ts                 env loading and validation
  session-store.ts          file-backed session + pending state store
  enablebanking/
    client.ts               JWT signing and authenticated fetch wrapper
    api.ts                  typed Enable Banking endpoints
    types.ts                API schemas used by this service
  lib/
    dates.ts                date parsing and range resolution
    transactions.ts         filtering and normalization
    errors.ts               HttpError
  routes/
    auth.ts                 /aspsps, /auth, /session
    accounts.ts             /accounts
    transactions.ts         /transactions
test/
  dates.test.ts             date-range unit tests
  transactions.test.ts      filtering and normalization unit tests
  integration.test.ts       end-to-end flow against the mock
  fixtures/
    mock-enable-banking.ts  reusable in-process Enable Banking mock
```
