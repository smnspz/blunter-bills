import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createFileRepositories,
  type StoredMailConnection,
  type StoredSession,
} from "../src/repositories/index.js";

const SESSION: StoredSession = {
  sessionId: "sess-1",
  accounts: [
    {
      uid: "acc-1",
      name: "Checking",
      iban: "FI001234",
      currency: "EUR",
    },
  ],
  aspspName: "Nordea",
  aspspCountry: "FI",
  accessValidUntil: "2027-02-09T13:53:32.157Z",
  psuType: "personal",
  authorizedAt: "2026-11-11T00:00:00.000Z",
};

const MAIL: StoredMailConnection = {
  provider: "gmail",
  refreshToken: "test-refresh-token",
  connectedAt: "2026-11-11T00:00:00.000Z",
};

/**
 * Runs a callback with an isolated temporary directory.
 *
 * @param callback - Test body.
 * @returns Nothing.
 */
async function withTempDir(callback: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "blunter-bills-repositories-"));
  try {
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("File repositories", () => {
  it("persists and clears the bank session and pending states", async () => {
    await withTempDir(async (dir) => {
      const repositories = createFileRepositories(dir);

      await repositories.sessions.saveSession(SESSION);
      assert.deepEqual(await repositories.sessions.getSession(), SESSION);

      await repositories.sessions.addPendingState(
        "bank-state",
        "http://localhost:5173/auth/callback",
      );
      const pending = await repositories.sessions.consumePendingState("bank-state");
      assert.equal(pending?.state, "bank-state");
      assert.equal(pending?.returnUrl, "http://localhost:5173/auth/callback");
      assert.equal(await repositories.sessions.consumePendingState("bank-state"), null);

      await repositories.sessions.clearSession();
      assert.equal(await repositories.sessions.getSession(), null);
    });
  });

  it("persists and clears the mail connection and pending states", async () => {
    await withTempDir(async (dir) => {
      const repositories = createFileRepositories(dir);

      await repositories.mail.saveConnection(MAIL);
      assert.deepEqual(await repositories.mail.getConnection(), MAIL);

      await repositories.mail.addPendingState("mail-state");
      assert.equal(await repositories.mail.consumePendingState("mail-state"), true);
      assert.equal(await repositories.mail.consumePendingState("mail-state"), false);

      await repositories.mail.clearConnection();
      assert.equal(await repositories.mail.getConnection(), null);
    });
  });

  it("reloads persisted data from a new repository instance", async () => {
    await withTempDir(async (dir) => {
      const first = createFileRepositories(dir);
      await first.sessions.saveSession(SESSION);
      await first.mail.saveConnection(MAIL);

      const second = createFileRepositories(dir);
      assert.deepEqual(await second.sessions.getSession(), SESSION);
      assert.deepEqual(await second.mail.getConnection(), MAIL);
    });
  });
});
