import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import {
  createGmailAuthorizationUrl,
  exchangeGmailAuthorizationCode,
  MailError,
} from "../src/index.js";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * Reads a required environment variable.
 *
 * @param name - Variable name.
 * @returns The trimmed value.
 * @throws {Error} When the variable is missing or empty.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`Missing ${name}. Add it to packages/mail/.env.`);
  }
  return value;
}

/**
 * Writes a plain-text response.
 *
 * @param response - Outgoing response.
 * @param status - HTTP status.
 * @param message - Response body.
 * @returns Nothing. Ends the response.
 */
function respond(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

const clientId = required("GOOGLE_CLIENT_ID");
const clientSecret = required("GOOGLE_CLIENT_SECRET");
const redirectUri =
  process.env.GOOGLE_REDIRECT_URI?.trim() || "http://localhost:8765/oauth2callback";
const redirect = new URL(redirectUri);
const port = Number(redirect.port === "" ? "80" : redirect.port);
const state = randomUUID();
const authUrl = createGmailAuthorizationUrl({ clientId, redirectUri, state });

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", redirectUri);

  if (url.pathname !== redirect.pathname) {
    respond(response, 404, "Not found.");
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (error !== null) {
    respond(response, 400, `Authorization failed: ${error}`);
    shutdown();
    return;
  }

  if (code === null || returnedState !== state) {
    respond(response, 400, "Invalid authorization callback.");
    shutdown();
    return;
  }

  try {
    const tokens = await exchangeGmailAuthorizationCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });

    if (tokens.refreshToken === null) {
      respond(
        response,
        200,
        "Authorization completed but no refresh token was returned. Revoke the app's access and run this again.",
      );
      console.warn(
        "No refresh token returned. Revoke access at https://myaccount.google.com/permissions and retry.",
      );
    } else {
      respond(response, 200, "Gmail connected. You can close this tab.");
      console.log("\nAdd this to packages/mail/.env (and later apps/api/.env):\n");
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refreshToken}\n`);
      console.log(`Access token expires in ${tokens.expiresIn}s.`);
      console.log(`Scope: ${tokens.scope ?? "unknown"}`);
    }
  } catch (caught) {
    const message =
      caught instanceof MailError ? `${caught.code}: ${caught.message}` : String(caught);
    respond(response, 500, `Token exchange failed: ${message}`);
    console.error(message);
  } finally {
    shutdown();
  }
});

/**
 * Stops the callback server and exits.
 *
 * @returns Nothing.
 */
function shutdown(): void {
  server.close(() => process.exit(0));
}

server.listen(port, () => {
  console.log("Open this URL to authorize Gmail:\n");
  console.log(authUrl);
  console.log(`\nWaiting for the callback on ${redirectUri} ...\n`);
});
