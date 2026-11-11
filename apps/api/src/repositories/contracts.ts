/** Account persisted from an authorized bank session. */
export interface StoredAccount {
  uid: string;
  name: string | null;
  iban: string | null;
  currency: string | null;
}

/** Authorized bank session persisted between requests. */
export interface StoredSession {
  sessionId: string;
  accounts: StoredAccount[];
  aspspName: string;
  aspspCountry: string;
  accessValidUntil: string | null;
  psuType: string | null;
  authorizedAt: string;
}

/** Pending bank authorization state awaiting the redirect. */
export interface PendingState {
  state: string;
  createdAt: string;
  returnUrl: string | null;
}

/** Connected mail account persisted between requests. */
export interface StoredMailConnection {
  provider: "gmail";
  refreshToken: string;
  connectedAt: string;
}

/** Persistence port for the bank session and pending bank states. */
export interface SessionRepository {
  /**
   * Returns the stored bank session.
   *
   * @returns The session, or null when the user has not authorized yet.
   */
  getSession(): Promise<StoredSession | null>;

  /**
   * Stores an authorized session and clears pending bank states.
   *
   * @param session - Session to persist.
   * @returns Nothing.
   */
  saveSession(session: StoredSession): Promise<void>;

  /**
   * Clears the stored bank session.
   *
   * @returns Nothing.
   */
  clearSession(): Promise<void>;

  /**
   * Records a pending bank authorization state.
   *
   * @param state - Opaque state value.
   * @param returnUrl - Frontend URL to return to after the callback, or null.
   * @returns Nothing.
   */
  addPendingState(state: string, returnUrl: string | null): Promise<void>;

  /**
   * Consumes a pending bank authorization state.
   *
   * @param state - State value returned by Enable Banking.
   * @returns The consumed state, or null when unknown or expired.
   */
  consumePendingState(state: string): Promise<PendingState | null>;
}

/** Persistence port for the mail connection and pending mail states. */
export interface MailRepository {
  /**
   * Returns the stored mail connection.
   *
   * @returns The connection, or null when no mailbox is connected.
   */
  getConnection(): Promise<StoredMailConnection | null>;

  /**
   * Stores the connected mail account and clears pending mail states.
   *
   * @param connection - Mail connection to persist.
   * @returns Nothing.
   */
  saveConnection(connection: StoredMailConnection): Promise<void>;

  /**
   * Clears the stored mail connection.
   *
   * @returns Nothing.
   */
  clearConnection(): Promise<void>;

  /**
   * Records a pending mail OAuth state.
   *
   * @param state - Opaque OAuth state value.
   * @returns Nothing.
   */
  addPendingState(state: string): Promise<void>;

  /**
   * Consumes a pending mail OAuth state.
   *
   * @param state - State value returned by the provider.
   * @returns True when the state was valid.
   */
  consumePendingState(state: string): Promise<boolean>;
}

/** Repository bundle injected into the app. */
export interface AppRepositories {
  sessions: SessionRepository;
  mail: MailRepository;
}
