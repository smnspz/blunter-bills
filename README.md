# Blunter Bills

A single-user personal finance app: a Fastify API and a React dashboard, with
backend-only workspace packages for Enable Banking and Gmail. Brutalist by
design.

## Structure

```
apps/api                  Fastify + TypeScript backend
apps/web                  Vite + React 19 + React Compiler + Tailwind v4 SPA
packages/enable-banking   standalone Enable Banking SDK
packages/mail             provider-agnostic mail reading (Gmail adapter)
```

The web app talks only to the API. The API uses the two packages for provider
access; both are backend-only and hold credentials.

## Quick start

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
# Fill in the bank and Gmail credentials: see docs/SETUP.md
pnpm dev
```

- API: <http://localhost:3000>
- Web: <http://localhost:5173>

## Flow

- Connect a bank through Enable Banking's hosted SCA redirect.
- Connect Gmail with read-only access for bill scanning.
- The dashboard shows the connected session.

## Scripts

```bash
pnpm dev            # API + web
pnpm dev:api
pnpm dev:web
pnpm build          # packages -> API -> web
pnpm typecheck
pnpm test
pnpm format
pnpm format:check
```

## Testing

`pnpm test` runs every suite without credentials or network access. The API uses
fake provider clients and in-memory repositories; the SDKs use in-process HTTP
mocks and throwaway keys.

## Docs

- Local setup: [`docs/SETUP.md`](docs/SETUP.md)
- API: [`apps/api/README.md`](apps/api/README.md)
- Enable Banking SDK: [`packages/enable-banking/README.md`](packages/enable-banking/README.md)
- Mail reader: [`packages/mail/README.md`](packages/mail/README.md)

## Safety

- `.env`, `.data/`, and key files are gitignored.
- The bank private key belongs outside the repo.
- Provider tokens stay server-side; the browser only receives connection status.
