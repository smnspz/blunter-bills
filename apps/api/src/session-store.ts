import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";

const STORE_FILE_NAME = "store.json";
const TEMP_FILE_SUFFIX = ".tmp";
const PENDING_STATE_TTL_MS = 15 * 60 * 1000;
const DATA_DIR_MODE = 0o700;
const STORE_FILE_MODE = 0o600;

/** Account persisted from an authorized session. */
export interface StoredAccount {
  uid: string;
  name: string | null;
  iban: string | null;
  currency: string | null;
}

/** Authorized session persisted between requests. */
export interface StoredSession {
  sessionId: string;
  accounts: StoredAccount[];
  aspspName: string;
  aspspCountry: string;
  accessValidUntil: string | null;
  psuType: string | null;
  authorizedAt: string;
}

/** Pending authorization state awaiting the bank redirect. */
export interface PendingState {
  state: string;
  createdAt: string;
  returnUrl: string | null;
}

interface StoreData {
  session: StoredSession | null;
  pendingStates: PendingState[];
}

const storeFile = join(config.dataDir, STORE_FILE_NAME);

let cache: StoreData | null = null;
let writeChain: Promise<void> = Promise.resolve();

/**
 * Creates an empty store.
 *
 * @returns A store with no session and no pending states.
 */
function createEmptyStore(): StoreData {
  return { session: null, pendingStates: [] };
}

/**
 * Removes pending states older than the TTL.
 *
 * @param store - Store to prune in place.
 * @returns Nothing. Mutates the store.
 */
function prunePendingStates(store: StoreData): void {
  const cutoff = Date.now() - PENDING_STATE_TTL_MS;
  store.pendingStates = store.pendingStates.filter(
    (pending) => new Date(pending.createdAt).getTime() > cutoff,
  );
}

/**
 * Loads the store from disk, caching the result in memory.
 *
 * @returns The cached or freshly loaded store.
 * @throws {Error} When the store file exists but cannot be parsed.
 */
async function load(): Promise<StoreData> {
  if (cache !== null) return cache;

  //else

  let raw: string;
  try {
    raw = await readFile(storeFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      cache = createEmptyStore();
      return cache;
    }
    throw error;
  }

  try {
    cache = JSON.parse(raw) as StoreData;
  } catch {
    throw new Error(`Could not parse ${storeFile}. Fix or delete it before starting the service.`);
  }

  // Normalize stores written before return URLs were tracked
  cache.pendingStates = cache.pendingStates.map((pending) => ({
    ...pending,
    returnUrl: pending.returnUrl ?? null,
  }));

  prunePendingStates(cache);
  return cache;
}

/**
 * Writes the store to disk atomically.
 *
 * @param store - Store snapshot to serialize.
 * @returns Nothing. Writes the file.
 */
async function writeStore(store: StoreData): Promise<void> {
  await mkdir(config.dataDir, { recursive: true, mode: DATA_DIR_MODE });

  const tempFile = `${storeFile}.${randomUUID()}${TEMP_FILE_SUFFIX}`;
  await writeFile(tempFile, `${JSON.stringify(store, null, 2)}\n`, { mode: STORE_FILE_MODE });
  await rename(tempFile, storeFile);
}

/**
 * Queues a store write, serializing it with any in-flight write.
 *
 * @param store - Store snapshot to persist.
 * @returns Nothing. Resolves once the write completes.
 */
async function persist(store: StoreData): Promise<void> {
  cache = store;
  const runWrite = (): Promise<void> => writeStore(store);
  writeChain = writeChain.then(runWrite, runWrite);
  await writeChain;
}

/**
 * Returns the currently stored session.
 *
 * @returns The stored session, or null when the user has not authorized yet.
 */
export async function getStoredSession(): Promise<StoredSession | null> {
  return (await load()).session;
}

/**
 * Stores an authorized session and clears any pending states.
 *
 * @param session - Session to persist.
 * @returns Nothing. Writes the store.
 */
export async function saveSession(session: StoredSession): Promise<void> {
  const store = await load();
  store.session = session;
  store.pendingStates = [];
  await persist(store);
}

/**
 * Clears the stored session.
 *
 * @returns Nothing. Writes the store.
 */
export async function clearSession(): Promise<void> {
  const store = await load();
  store.session = null;
  await persist(store);
}

/**
 * Records an authorization state issued by this service.
 *
 * @param state - Opaque state value sent to Enable Banking.
 * @param returnUrl - Frontend URL to redirect to after the bank callback, or null.
 * @returns Nothing. Writes the store.
 */
export async function addPendingState(state: string, returnUrl: string | null): Promise<void> {
  const store = await load();
  prunePendingStates(store);
  store.pendingStates.push({ state, createdAt: new Date().toISOString(), returnUrl });
  await persist(store);
}

/**
 * Consumes an authorization state if it was issued by this service and is still valid.
 *
 * @param state - State value returned by Enable Banking.
 * @returns The consumed pending state, or null when the state is unknown or expired.
 */
export async function consumePendingState(state: string): Promise<PendingState | null> {
  const store = await load();
  prunePendingStates(store);

  const index = store.pendingStates.findIndex((pending) => pending.state === state);
  if (index === -1) return null;

  //else

  const [pending] = store.pendingStates.splice(index, 1);
  await persist(store);
  return pending ?? null;
}
