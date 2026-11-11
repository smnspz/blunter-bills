/** Port for obtaining a provider access token. */
export interface AccessTokenProvider {
  /**
   * Returns a valid access token, refreshing it when necessary.
   *
   * @returns A bearer token.
   */
  getAccessToken(): Promise<string>;
}
