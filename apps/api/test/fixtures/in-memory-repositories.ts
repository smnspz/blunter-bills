import type {
  MailRepository,
  PendingState,
  SessionRepository,
  StoredMailConnection,
  StoredSession,
} from "../../src/repositories/index.js";

/**
 * In-memory {@link SessionRepository} for API tests.
 */
export class InMemorySessionRepository implements SessionRepository {
  private session: StoredSession | null = null;
  private pendingStates: PendingState[] = [];

  /** @inheritdoc */
  async getSession(): Promise<StoredSession | null> {
    return this.session;
  }

  /** @inheritdoc */
  async saveSession(session: StoredSession): Promise<void> {
    this.session = session;
    this.pendingStates = [];
  }

  /** @inheritdoc */
  async clearSession(): Promise<void> {
    this.session = null;
  }

  /** @inheritdoc */
  async addPendingState(state: string, returnUrl: string | null): Promise<void> {
    this.pendingStates.push({ state, createdAt: new Date().toISOString(), returnUrl });
  }

  /** @inheritdoc */
  async consumePendingState(state: string): Promise<PendingState | null> {
    const index = this.pendingStates.findIndex((pending) => pending.state === state);
    if (index === -1) return null;

    //else

    return this.pendingStates.splice(index, 1)[0] ?? null;
  }
}

/**
 * In-memory {@link MailRepository} for API tests.
 */
export class InMemoryMailRepository implements MailRepository {
  private connection: StoredMailConnection | null = null;
  private pendingStates: string[] = [];

  /** @inheritdoc */
  async getConnection(): Promise<StoredMailConnection | null> {
    return this.connection;
  }

  /** @inheritdoc */
  async saveConnection(connection: StoredMailConnection): Promise<void> {
    this.connection = connection;
    this.pendingStates = [];
  }

  /** @inheritdoc */
  async clearConnection(): Promise<void> {
    this.connection = null;
  }

  /** @inheritdoc */
  async addPendingState(state: string): Promise<void> {
    this.pendingStates.push(state);
  }

  /** @inheritdoc */
  async consumePendingState(state: string): Promise<boolean> {
    const index = this.pendingStates.indexOf(state);
    if (index === -1) return false;

    //else

    this.pendingStates.splice(index, 1);
    return true;
  }
}
