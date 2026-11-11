# @blunter-bills/mail

Provider-agnostic email reading with a Gmail adapter. It returns normalized
subjects, plain-text bodies, sender/recipient headers, and timestamps.

The package is backend-only: it needs Google OAuth credentials and a refresh
token. Never ship it to the browser.

## Usage

```ts
import { createGmailReader } from "@blunter-bills/mail";

const reader = createGmailReader({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
});

const messages = await reader.readMessages({
  maxResults: 10,
  query: "is:unread", // Gmail search syntax
});

for (const message of messages) {
  console.log(message.subject);
  console.log(message.from);
  console.log(message.body);
}
```

`EmailMessage`:

```ts
interface EmailMessage {
  provider: string; // "gmail"
  id: string;
  threadId: string | null;
  subject: string;
  body: string; // best-effort plain text
  from: string | null;
  to: string[];
  receivedAt: string | null; // ISO 8601
  snippet: string | null;
}
```

For tests or custom auth, pass an `AccessTokenProvider` instead:

```ts
const reader = createGmailReader({
  accessTokenProvider: {
    getAccessToken: async () => "ya29...",
  },
});
```

## Architecture

```
src/core/             EmailMessage, MailReader, AccessTokenProvider, MailError
src/adapters/gmail/   Gmail reader, token refresh, OAuth helpers, MIME decoding
```

Adding another provider means implementing `MailReader`; the core never imports
Gmail.

## Errors

`MailError` exposes a stable `code`:

| Code              | Meaning                                   |
| ----------------- | ----------------------------------------- |
| `AUTH_FAILED`     | Google rejected the code or refresh token |
| `API_ERROR`       | Gmail returned a non-2xx response         |
| `TRANSPORT_ERROR` | The network request failed                |
| `CONFIG_ERROR`    | Reserved for configuration failures       |

`status` is the upstream HTTP status when available, and `details` contains the
raw provider payload.

## Setup

Google Cloud, OAuth scopes, redirect URIs, and the CLI auth flow are documented
in [`docs/SETUP.md`](../../docs/SETUP.md).

- `packages/mail/.env` is for the standalone CLI scripts.
- The web flow uses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in
  `apps/api/.env` and stores the refresh token in the API's `store.json`.
- External apps in Google Testing mode get 7-day refresh tokens.

## Testing

```bash
pnpm --filter @blunter-bills/mail test
pnpm --filter @blunter-bills/mail typecheck
```

Tests use an in-process mock of Google OAuth and the Gmail API. They verify token
refresh/caching, authorization-code exchange, subject decoding, MIME body
extraction, pagination options, and error mapping. No credentials or network
access are required.

## Limitations

- Bodies are best-effort plain text. `text/plain` is preferred; `text/html` is
  stripped with a small tag/entity cleaner. For complex HTML, add a dedicated
  MIME/HTML parser later.
- `maxResults` is clamped to Gmail's 100-message limit per request.
- The package reads only. Sending, labels, attachments, and history sync are
  intentionally out of scope for now.
