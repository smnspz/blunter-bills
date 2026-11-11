/**
 * Appends non-undefined query parameters to a URL.
 *
 * @param url - Base URL.
 * @param params - Query parameters to set.
 * @returns The URL with the applied parameters.
 */
export function withQueryParams(url: string, params: Record<string, string | undefined>): string {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) target.searchParams.set(key, value);
  }
  return target.toString();
}
