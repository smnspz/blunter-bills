# @blunter-bills/mail

Provider-agnostic email reading with a Gmail adapter. It returns normalized
subjects, plain-text bodies, sender/recipient headers, and timestamps.

The package is backend-only: it needs Google OAuth client credentials and a
refresh token. Never ship it to the browser.

## Architecture

Lightweight hexagonal layout:

```
src/
  core/
    email.ts            EmailMessage, ReadMessagesOptions
    mail-reader.ts      MailReader port
    access-token.ts     AccessTokenProvider port
    errors.ts           MailError
  adapters/
    gmail/
      gmail-reader.ts   Gmail implementation of MailReader
      gmail-auth.ts     refresh-token access token provider
      gmail-oauth.ts    consent URL + code exchange
      gmail-mime.ts     MIME/body/header decoding
```

Adding another provider means implementing `MailReader`; the core does not
import Gmail.

## Google Cloud setup

### 1. Create a project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project selector at the top and create a project, e.g.
   `Blunter Bills Mail`.

### 2. Enable the Gmail API

1. Go to **APIs & Services → Library**.
2. Search for **Gmail API**.
3. Open it and click **Enable**.

### 3. Configure Google Auth Platform

The current console calls this **Google Auth Platform**; older projects show
**APIs & Services → OAuth consent screen**.

1. Open **Google Auth Platform → Branding**.
2. Click **Get started** if prompted.
3. App name: `Blunter Bills Mail`.
4. User support email: your Gmail address.
5. Audience:
   - **External** for a personal Gmail account.
   - **Internal** only if this is a Google Workspace account.
6. Contact email: your Gmail address.
7. Accept the User Data Policy and click **Create**.

### 4. Add yourself as a test user

1. Open **Google Auth Platform → Audience**.
2. Under **Test users**, click **Add users**.
3. Add the Gmail account you will read.
4. Save.

While the app is in **Testing**, only listed test users can authorize it.

### 5. Add the Gmail scope

1. Open **Google Auth Platform → Data Access**.
2. Click **Add or remove scopes**.
3. Add:

```text
https://www.googleapis.com/auth/gmail.readonly
```

This is read-only. Do not add `gmail.send` or `gmail.modify` unless you need
them later.

### 6. Create the OAuth client

1. Open **Google Auth Platform → Clients**.
2. Click **Create client**.
3. Application type: **Web application**.
4. Name: `Blunter Bills Mail Local`.
5. Under **Authorized redirect URIs**, add both:

```text
http://localhost:8765/oauth2callback
http://localhost:3000/mail/gmail/callback
```

The first is for the CLI auth script; the second is for the web setup flow in
the API. You can omit the CLI URI if you only use the frontend.

6. Create, then copy the **client ID** and **client secret**.

### 7. Configure the package

```bash
cd packages/mail
cp .env.example .env
```

Fill in:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8765/oauth2callback
```

### 8. Authorize once and get a refresh token

```bash
pnpm --filter @blunter-bills/mail authorize:gmail
```

1. Open the printed URL.
2. Choose the Google account you added as a test user.
3. Click through the "unverified app" warning.
4. Approve read-only Gmail access.
5. The script prints `GOOGLE_REFRESH_TOKEN=...`.

Copy that line into `packages/mail/.env` (and later into `apps/api/.env` when
the API starts using this package).

### 9. Verify against your real inbox

```bash
pnpm --filter @blunter-bills/mail read:latest
```

It prints the five most recent subjects, senders, timestamps, and body excerpts.

### Web setup flow

The API can run the same consent flow for the frontend:

1. The web app calls `POST /mail/gmail/start`.
2. The API creates a state and returns the Google consent URL.
3. Google redirects to `GOOGLE_REDIRECT_URI`
   (`http://localhost:3000/mail/gmail/callback`).
4. The API exchanges the code and stores the refresh token in `.data/store.json`.
5. The browser is redirected to `/setup/mail?mail=success`.

Set the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `apps/api/.env`, and
make sure the web callback URI is registered on the OAuth client.

## Testing mode and token expiry

An **External** OAuth app in **Testing** gets refresh tokens that expire after
**7 days**. You can re-run `authorize:gmail` weekly, or publish the app.

Publishing an app that requests `gmail.readonly` (a restricted scope) triggers
Google verification, which is intended for public multi-user apps. For a
personal single-user setup, staying in Testing and re-authorizing is usually the
pragmatic choice. A **Workspace Internal** app avoids the 7-day expiry.

Revoke access at any time at <https://myaccount.google.com/permissions>.

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

For tests or advanced auth, pass an `AccessTokenProvider` instead:

```ts
const reader = createGmailReader({
  accessTokenProvider: {
    getAccessToken: async () => "ya29...",
  },
});
```

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

## Development

```bash
pnpm --filter @blunter-bills/mail test
pnpm --filter @blunter-bills/mail typecheck
pnpm --filter @blunter-bills/mail build
```

Tests use an in-process mock of Google OAuth and the Gmail API. They verify
token refresh/caching, authorization-code exchange, subject decoding, MIME body
extraction, pagination options, and error mapping. No credentials or network
access are required.

## Limitations

- Bodies are best-effort plain text. `text/plain` is preferred; `text/html` is
  stripped with a small tag/entity cleaner. For complex HTML, add a dedicated
  MIME/HTML parser later.
- `maxResults` is clamped to Gmail's 100-message limit per request.
- This package reads only. Sending, labels, attachments, and history sync are
  intentionally out of scope for now.
