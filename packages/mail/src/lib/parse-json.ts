/**
 * Parses a response body, falling back to the raw text for non-JSON payloads.
 *
 * @param text - Raw response body.
 * @returns Parsed JSON, raw text, or undefined when empty.
 */
export function parseJson(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
