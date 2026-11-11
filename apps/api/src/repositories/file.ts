import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AppRepositories,
  MailRepository,
  PendingState,
  SessionRepository,
  StoredMailConnection,
  StoredSession,
} from "./contracts.js";

const STORE_FILE_NAME = "store.json";
const TEMP_FILE_SUFFIX = ".tmp";
const PENDING_STATE_TTL_MS = 15 * 60 * 1000;
const DATA_DIR_MODE = 0o700;
const STORE_FILE_MODE = 0o600;

interface MailPendingState {
  state: string;
  createdAt: string;
}

interface StoreData {
  session: StoredSession | null;
  pendingStates: PendingState[];
  mail: StoredMailConnection | null;
  mailPendingStates: MailPendingState[];
}

/**
 * Creates an empty store.
 *
 * @returns A store with no session, pending states, or mail connection.
 */
function createEmptyStore(): StoreData {
  return { session: null, pendingStates: [], mail: null, mailPendingStates: [] };
}

/**
 * Removes states older than the TTL.
 *
 * @param states - Pending states to filter.
 * @returns The states that are still valid.
 */
function pruneStates<T extends { createdAt: string }>(states: T[]): T[] {
  const cutoff = Date.now() - PENDING_STATE_TTL_MS;
  return states.filter((state) => new Date(state.createdAt).getTime() > cutoff);
}

/**
 * Removes pending bank and mail states older than the TTL.
 *
 * @param store - Store to prune in place.
 * @returns Nothing. Mutates the store.
 */
function prunePendingStates(store: StoreData): void {
  store.pendingStates = pruneStates(store.pendingStates);
  store.mailPendingStates = pruneStates(store.mailPendingStates);
}

/**
 * JSON-file persistence shared by the file repositories.
 */
class JsonFileStore {
  private cache: StoreData | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  /**
   * Creates a file store.
   *
   * @param filePath - Path to the JSON store file.
   */
  constructor(private readonly filePath: string) {}

  /**
   * Reads the store, pruning expired pending states.
   *
   * @returns The current store.
   */
  async read(): Promise<StoreData> {
    const data = await this.load();
    prunePendingStates(data);
    return data;
  }

  /**
   * Applies a mutation and persists the result.
   *
   * @typeParam T - Mutation return value.
   * @param mutator - Mutation to apply.
   * @returns The mutation result.
   */
  async update<T>(mutator: (data: StoreData) => T): Promise<T> {
    const data = await this.load();
    prunePendingStates(data);
    const result = mutator(data);
    await this.persist(data);
    return result;
  }

  /**
   * Loads the store from disk, caching the result in memory.
   *
   * @returns The cached or freshly loaded store.
   * @throws {Error} When the store file exists but cannot be parsed.
   */
  private async load(): Promise<StoreData> {
    if (this.cache !== null) return this.cache;

    //else

    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = createEmptyStore();
        return this.cache;
      }
      throw error;
    }

    try {
      this.cache = JSON.parse(raw) as StoreData;
    } catch {
      throw new Error(
        `Could not parse ${this.filePath}. Fix or delete it before starting the service.`,
      );
    }

    // Normalize stores written before mail and return URLs were tracked
    this.cache.pendingStates = this.cache.pendingStates.map((pending) => ({
      ...pending,
      returnUrl: pending.returnUrl ?? null,
    }));
    this.cache.mail = this.cache.mail ?? null;
    this.cache.mailPendingStates = this.cache.mailPendingStates ?? [];

    return this.cache;
  }

  /**
   * Queues a store write, serializing it with any in-flight write.
   *
   * @param store - Store snapshot to persist.
   * @returns Nothing. Resolves once the write completes.
   */
  private async persist(store: StoreData): Promise<void> {
    this.cache = store;
    const runWrite = (): Promise<void> => this.writeStore(store);
    this.writeChain = this.writeChain.then(runWrite, runWrite);
    await this.writeChain;
  }

  /**
   * Writes the store to disk atomically.
   *
   * @param store - Store snapshot to serialize.
   * @returns Nothing. Writes the file.
   */
  private async writeStore(store: StoreData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: DATA_DIR_MODE });

    const tempFile = `${this.filePath}.${randomUUID()}${TEMP_FILE_SUFFIX}`;
    await writeFile(tempFile, `${JSON.stringify(store, null, 2)}\n`, { mode: STORE_FILE_MODE });
    await rename(tempFile, this.filePath);
  }
}

/**
 * File-backed implementation of {@link SessionRepository}.
 */
class FileSessionRepository implements SessionRepository {
  /**
   * Creates a file-backed session repository.
   *
   * @param store - Shared JSON file store.
   */
  constructor(private readonly store: JsonFileStore) {}

  async getSession(): Promise<StoredSession | null> {
    return (await this.store.read()).session;
  }

  async saveSession(session: StoredSession): Promise<void> {
    await this.store.update((data) => {
      data.session = session;
      data.pendingStates = [];
    });
  }

  async clearSession(): Promise<void> {
    await this.store.update((data) => {
      data.session = null;
    });
  }

  async addPendingState(state: string, returnUrl: string | null): Promise<void> {
    await this.store.update((data) => {
      data.pendingStates.push({ state, createdAt: new Date().toISOString(), returnUrl });
    });
  }

  async consumePendingState(state: string): Promise<PendingState | null> {
    return this.store.update((data) => {
      const index = data.pendingStates.findIndex((pending) => pending.state === state);
      if (index === -1) return null;

      //else

      return data.pendingStates.splice(index, 1)[0] ?? null;
    });
  }
}

/**
 * File-backed implementation of {@link MailRepository}.
 */
class FileMailRepository implements MailRepository {
  /**
   * Creates a file-backed mail repository.
   *
   * @param store - Shared JSON file store.
   */
  constructor(private readonly store: JsonFileStore) {}

  async getConnection(): Promise<StoredMailConnection | null> {
    return (await this.store.read()).mail;
  }

  async saveConnection(connection: StoredMailConnection): Promise<void> {
    await this.store.update((data) => {
      data.mail = connection;
      data.mailPendingStates = [];
    });
  }

  async clearConnection(): Promise<void> {
    await this.store.update((data) => {
      data.mail = null;
    });
  }

  async addPendingState(state: string): Promise<void> {
    await this.store.update((data) => {
      data.mailPendingStates.push({ state, createdAt: new Date().toISOString() });
    });
  }

  async consumePendingState(state: string): Promise<boolean> {
    return this.store.update((data) => {
      const index = data.mailPendingStates.findIndex((pending) => pending.state === state);
      if (index === -1) return false;

      //else

      data.mailPendingStates.splice(index, 1);
      return true;
    });
  }
}

/**
 * Creates the file-backed repository bundle.
 *
 * @param dataDir - Directory containing `store.json`.
 * @returns The session and mail repositories.
 */
export function createFileRepositories(dataDir: string): AppRepositories {
  const store = new JsonFileStore(join(dataDir, STORE_FILE_NAME));
  return {
    sessions: new FileSessionRepository(store),
    mail: new FileMailRepository(store),
  };
}
