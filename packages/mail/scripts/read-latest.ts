import { existsSync } from "node:fs";
import { createGmailReader, MailError } from "../src/index.js";

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

const reader = createGmailReader({
  clientId: required("GOOGLE_CLIENT_ID"),
  clientSecret: required("GOOGLE_CLIENT_SECRET"),
  refreshToken: required("GOOGLE_REFRESH_TOKEN"),
});

try {
  const messages = await reader.readMessages({ maxResults: 5 });

  if (messages.length === 0) {
    console.log("No messages found.");
  } else {
    for (const [index, message] of messages.entries()) {
      console.log(`\n[${index + 1}] ${message.subject}`);
      console.log(`    from: ${message.from ?? "unknown"}`);
      console.log(`    at:   ${message.receivedAt ?? "unknown"}`);
      console.log(`    body: ${message.body.slice(0, 300).replaceAll("\n", " ")}`);
    }
  }
} catch (error) {
  if (error instanceof MailError) {
    console.error(
      `${error.code}${error.status === undefined ? "" : ` (${error.status})`}: ${error.message}`,
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
