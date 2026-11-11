# Local setup

Detailed credentials and OAuth setup for running Blunter Bills locally. For a
project overview, see the [root README](../README.md). For package usage, see
the [API](../apps/api/README.md), [Enable Banking SDK](../packages/enable-banking/README.md),
and [mail](../packages/mail/README.md) READMEs.

## Prerequisites

- Node.js >= 24 (`.nvmrc`)
- pnpm
- An Enable Banking application (sandbox is enough to start)
- A Google Cloud project with Gmail API access

## Enable Banking

### 1. Generate a key and certificate

Enable Banking authenticates the app with a JWT signed by an RSA key. The
matching public certificate is registered with them.

```bash
openssl genrsa -out private.key 4096

openssl req -new -x509 -days 365 -key private.key -out public.crt \
  -subj "/C=FI/ST=Uusimaa/L=Helsinki/O=ExampleOrganisation/CN=example.com"
```

### 2. Register the application

In the [Enable Banking control panel](https://enablebanking.com/cp/applications):

1. Register a new application and choose **SANDBOX** or **PRODUCTION**.
2. Upload `public.crt`.
3. Add the redirect URL exactly as configured. For local development:
   `http://localhost:3000/auth/callback`.
4. Copy the generated **Application ID**.

Sandbox applications activate automatically. Production applications need
contractual formalities or whitelisted accounts.

### 3. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

At minimum:

```dotenv
ENABLE_BANKING_APP_ID=your-application-id
ENABLE_BANKING_PRIVATE_KEY_PATH=./private.key
ENABLE_BANKING_REDIRECT_URL=http://localhost:3000/auth/callback
```

The server starts without credentials (so `/health` works), but Enable Banking
routes return `503` until they are set.

#### Configuration reference

| Variable                           | Required | Default                                     | Description                                                                                             |
| ---------------------------------- | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ENABLE_BANKING_APP_ID`            | yes      | –                                           | Application ID from the control panel                                                                   |
| `ENABLE_BANKING_PRIVATE_KEY`       | one of   | –                                           | Inline PEM key (use `\n` for newlines)                                                                  |
| `ENABLE_BANKING_PRIVATE_KEY_PATH`  | one of   | –                                           | Path to the PEM private key                                                                             |
| `ENABLE_BANKING_REDIRECT_URL`      | yes      | `http://localhost:3000/auth/callback`       | Must match the registered redirect URL                                                                  |
| `ENABLE_BANKING_BASE_URL`          | no       | `https://api.enablebanking.com`             | API base URL                                                                                            |
| `ENABLE_BANKING_JWT_AUDIENCE`      | no       | `api.enablebanking.com`                     | JWT `aud` claim                                                                                         |
| `ENABLE_BANKING_ASPSP_NAME`        | no       | –                                           | Default bank name for `POST /auth`                                                                      |
| `ENABLE_BANKING_ASPSP_COUNTRY`     | no       | –                                           | Default bank country for `POST /auth`                                                                   |
| `ENABLE_BANKING_ACCESS_VALID_DAYS` | no       | `90`                                        | Requested consent lifetime                                                                              |
| `ENABLE_BANKING_TIMEOUT_MS`        | no       | `30000`                                     | Upstream request timeout                                                                                |
| `PORT` / `HOST`                    | no       | `3000` / `0.0.0.0`                          | HTTP listener                                                                                           |
| `LOG_LEVEL`                        | no       | `info`                                      | Fastify/pino log level                                                                                  |
| `SERVICE_API_KEY`                  | no       | –                                           | Require `Authorization: Bearer <key>` except on `/health`, `/auth/callback`, and `/mail/gmail/callback` |
| `DATA_DIR`                         | no       | `.data`                                     | File repository directory                                                                               |
| `FRONTEND_URL`                     | no       | `http://localhost:5173`                     | Allowed origin for `POST /auth` `return_url` redirects                                                  |
| `GOOGLE_CLIENT_ID`                 | no       | –                                           | Gmail OAuth client id for the web setup flow                                                            |
| `GOOGLE_CLIENT_SECRET`             | no       | –                                           | Gmail OAuth client secret                                                                               |
| `GOOGLE_REDIRECT_URI`              | no       | `http://localhost:3000/mail/gmail/callback` | Web Gmail OAuth redirect; must be registered on the Google client                                       |

Sandbox and production both use `https://api.enablebanking.com`. The environment
is determined by the application you registered, not by the URL.

### 4. Authorize the bank

1. Find the bank's exact name/country:

   ```bash
   curl "http://localhost:3000/aspsps?country=FI"
   ```

2. Start authorization:

   ```bash
   curl -X POST http://localhost:3000/auth \
     -H 'content-type: application/json' \
     -d '{"aspsp_name":"Nordea","aspsp_country":"FI","psu_type":"personal","return_url":"http://localhost:5173/auth/callback"}'
   ```

   Response:

   ```json
   {
     "url": "https://auth.enablebanking.com/ais/start?sessionid=...",
     "authorization_id": "...",
     "state": "..."
   }
   ```

3. Open `url` in a browser and authenticate with the bank. Enable Banking
   redirects to `ENABLE_BANKING_REDIRECT_URL`; the API exchanges the code and
   stores the session.

4. Confirm:

   ```bash
   curl http://localhost:3000/session
   curl http://localhost:3000/accounts
   ```

`return_url` is optional. Its origin must match `FRONTEND_URL`.

### 5. Local notes

- The private key belongs outside the repo; point
  `ENABLE_BANKING_PRIVATE_KEY_PATH` at it.
- `ENABLE_BANKING_REDIRECT_URL` must match the control-panel value exactly.
- `FRONTEND_URL` must match the origin used to open the web app.
- `SERVICE_API_KEY` protects API routes; the Vite proxy injects it server-side.
  `/health`, `/auth/callback`, and `/mail/gmail/callback` stay public.
- For a LAN test from a phone, the bank redirect URL must be reachable from that
  phone. An HTTPS tunnel is the simplest option.

## Gmail

### 1. Create a Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project, e.g. `Blunter Bills Mail`.

### 2. Enable the Gmail API

1. **APIs & Services → Library**.
2. Search **Gmail API**.
3. Open it and click **Enable**.

### 3. Configure Google Auth Platform

Current console: **Google Auth Platform**. Older projects:
**APIs & Services → OAuth consent screen**.

1. **Google Auth Platform → Branding → Get started**.
2. App name: `Blunter Bills Mail`.
3. User support email: your Gmail address.
4. Audience: **External** for personal Gmail; **Internal** only for Workspace.
5. Contact email: your Gmail address.
6. Accept the User Data Policy and create the app.

### 4. Add a test user

1. **Google Auth Platform → Audience**.
2. Under **Test users**, add the Gmail account you will read.

### 5. Add the Gmail scope

1. **Google Auth Platform → Data Access**.
2. Add:

   ```text
   https://www.googleapis.com/auth/gmail.readonly
   ```

Read-only access is enough. Do not add `gmail.send` or `gmail.modify` unless
needed later.

### 6. Create the OAuth client

1. **Google Auth Platform → Clients → Create client**.
2. Application type: **Web application**.
3. Under **Authorized redirect URIs**, add:

   ```text
   http://localhost:8765/oauth2callback
   http://localhost:3000/mail/gmail/callback
   ```

   The first is for the CLI auth script; the second is for the web setup flow.
   You can omit the CLI URI if you only use the frontend.

4. Copy the client ID and client secret.

### 7. Configure credentials

For the CLI and `read:latest` script:

```bash
cd packages/mail
cp .env.example .env
```

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8765/oauth2callback
```

For the web flow, put the same client ID/secret in `apps/api/.env` with:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/mail/gmail/callback
```

The web flow stores the Gmail refresh token in `apps/api/.data/store.json`; it
does not write it to `.env`.

### 8. Authorize the CLI once

```bash
pnpm --filter @blunter-bills/mail authorize:gmail
```

Open the printed URL, choose the test user, approve read-only access, and copy
the printed `GOOGLE_REFRESH_TOKEN=...` into `packages/mail/.env`.

### 9. Verify against the inbox

```bash
pnpm --filter @blunter-bills/mail read:latest
```

### Web setup flow

1. The web app calls `POST /mail/gmail/start`.
2. The API creates a state and returns the Google consent URL.
3. Google redirects to `GOOGLE_REDIRECT_URI`
   (`http://localhost:3000/mail/gmail/callback`).
4. The API exchanges the code and stores the refresh token in
   `apps/api/.data/store.json`.
5. The browser returns to `/setup/mail?mail=success`.

### Testing-mode token expiry

An **External** OAuth app in **Testing** gets refresh tokens that expire after
**7 days**. Re-run `authorize:gmail` weekly, publish the app (verification is
required for restricted scopes), or use a Workspace **Internal** app, which
avoids the expiry.

Revoke access at <https://myaccount.google.com/permissions>.
