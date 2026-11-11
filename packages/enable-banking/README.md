# @blunter-bills/enable-banking

Standalone, typed client for the [Enable Banking](https://enablebanking.com/docs/api/reference/)
account information API. It has no dependency on Fastify or the API's
environment; the API consumes it as a workspace package.

## Usage

```ts
import { createEnableBankingClient } from "@blunter-bills/enable-banking";

const client = createEnableBankingClient({
  appId: process.env.ENABLE_BANKING_APP_ID!,
  privateKeyPem: process.env.ENABLE_BANKING_PRIVATE_KEY_PEM!,
  // optional:
  baseUrl: "https://api.enablebanking.com",
  audience: "api.enablebanking.com",
  timeoutMs: 30_000,
});

const { aspsps } = await client.listAspsps({ country: "IT" });

const auth = await client.startAuthorization({
  access: { valid_until: "2027-01-01T00:00:00.000Z" },
  aspsp: { name: "UniCredit", country: "IT" },
  redirect_url: "http://localhost:3000/auth/callback",
  state: crypto.randomUUID(),
});
```

## Methods

| Method                              | Enable Banking endpoint           |
| ----------------------------------- | --------------------------------- |
| `listAspsps(query)`                 | `GET /aspsps`                     |
| `startAuthorization(input)`         | `POST /auth`                      |
| `authorizeSession(code)`            | `POST /sessions`                  |
| `getSession(sessionId)`             | `GET /sessions/{id}`              |
| `deleteSession(sessionId)`          | `DELETE /sessions/{id}`           |
| `getTransactions(accountId, query)` | `GET /accounts/{id}/transactions` |

Each client instance owns its RSA key and JWT cache, so separate instances can
use different credentials safely.

## Errors

- `EnableBankingError` — an upstream failure or a non-2xx response. Exposes
  `status`, `code`, and the raw `details` payload. Transport failures use
  `status: 502` and code `UPSTREAM_UNREACHABLE`.
- `EnableBankingConfigurationError` — missing/invalid `appId`, `privateKeyPem`,
  or `baseUrl`.

## Development

```bash
pnpm --filter @blunter-bills/enable-banking test
pnpm --filter @blunter-bills/enable-banking typecheck
pnpm --filter @blunter-bills/enable-banking build
```

Tests spin up an in-process HTTP mock, generate a throwaway RSA key, verify the
JWT header/signature, and exercise endpoint serialization and error mapping.
