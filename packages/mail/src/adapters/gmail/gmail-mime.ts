import { TextDecoder } from "node:util";
import type { EmailMessage } from "../../core/email.js";

/** Gmail message header. */
export interface GmailHeader {
  name: string;
  value: string;
}

/** Gmail message body payload. */
export interface GmailBody {
  data?: string;
  size?: number;
  attachmentId?: string;
}

/** Gmail MIME part. */
export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailPart[];
}

/** Subset of a Gmail message returned with `format=full`. */
export interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

const ENCODED_WORD_PATTERN = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

/**
 * Decodes bytes using the requested charset, falling back to UTF-8.
 *
 * @param bytes - Encoded bytes.
 * @param charset - Charset label from the encoded word.
 * @returns The decoded string.
 */
function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * Decodes an RFC 2047 Q-encoded word body.
 *
 * @param value - Q-encoded text.
 * @param charset - Charset label.
 * @returns The decoded string.
 */
function decodeQuotedPrintable(value: string, charset: string): string {
  const normalized = value.replaceAll("_", " ");
  const bytes: number[] = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? "";
    if (character === "=" && index + 2 < normalized.length) {
      const hex = normalized.slice(index + 1, index + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
    }
    bytes.push(character.charCodeAt(0) & 0xff);
  }

  return decodeBytes(Uint8Array.from(bytes), charset);
}

/**
 * Decodes RFC 2047 encoded words in a header value.
 *
 * @param value - Raw header value.
 * @returns The decoded header value.
 */
export function decodeMimeWords(value: string): string {
  return value.replace(
    ENCODED_WORD_PATTERN,
    (_match: string, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === "B") {
          return decodeBytes(Buffer.from(text, "base64"), charset);
        }
        return decodeQuotedPrintable(text, charset);
      } catch {
        return text;
      }
    },
  );
}

/**
 * Decodes a Gmail base64url body segment.
 *
 * @param data - Base64 or base64url text.
 * @returns The decoded UTF-8 string.
 */
function decodeBase64Url(data: string): string {
  const normalized = data.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

/**
 * Collects plain-text and HTML bodies from a MIME tree.
 *
 * @param part - MIME part to inspect.
 * @param bodies - Accumulator for plain and HTML bodies.
 * @returns Nothing. Mutates the accumulator.
 */
function collectBodies(part: GmailPart, bodies: { plain: string[]; html: string[] }): void {
  const data = part.body?.data;

  if (part.mimeType === "text/plain" && data !== undefined) {
    bodies.plain.push(decodeBase64Url(data));
  }
  if (part.mimeType === "text/html" && data !== undefined) {
    bodies.html.push(decodeBase64Url(data));
  }
  if (part.parts !== undefined) {
    for (const child of part.parts) collectBodies(child, bodies);
  }
  if (part.mimeType === undefined && part.parts === undefined && data !== undefined) {
    bodies.plain.push(decodeBase64Url(data));
  }
}

/**
 * Converts a code point to a string, ignoring invalid values.
 *
 * @param code - Unicode code point.
 * @returns The character, or an empty string when invalid.
 */
function codePointToString(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Converts HTML to a rough plain-text representation.
 *
 * @param html - HTML body.
 * @returns Plain text with tags and common entities removed.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match: string, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return codePointToString(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return codePointToString(Number.parseInt(entity.slice(1), 10));
      }
      switch (entity.toLowerCase()) {
        case "nbsp":
          return " ";
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        default:
          return entity;
      }
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts a best-effort plain-text body from a Gmail payload.
 * Prefers `text/plain`; falls back to stripped `text/html`.
 *
 * @param payload - Gmail MIME payload.
 * @returns Plain-text body, or an empty string.
 */
export function extractBody(payload: GmailPart | undefined): string {
  if (payload === undefined) return "";

  const bodies = { plain: [] as string[], html: [] as string[] };
  collectBodies(payload, bodies);

  if (bodies.plain.length > 0) return bodies.plain.join("\n").trim();
  if (bodies.html.length > 0) return stripHtml(bodies.html.join("\n"));
  return "";
}

/**
 * Finds a header value case-insensitively.
 *
 * @param headers - Gmail headers.
 * @param name - Header name.
 * @returns The header value, or undefined.
 */
function getHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}

/**
 * Maps a Gmail message to the normalized domain shape.
 *
 * @param message - Gmail message returned with `format=full`.
 * @returns The normalized email message.
 */
export function mapGmailMessage(message: GmailMessage): EmailMessage {
  const headers = message.payload?.headers;
  const timestamp = message.internalDate === undefined ? Number.NaN : Number(message.internalDate);
  const receivedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  const toHeader = getHeader(headers, "To");

  return {
    provider: "gmail",
    id: message.id,
    threadId: message.threadId ?? null,
    subject: decodeMimeWords(getHeader(headers, "Subject") ?? ""),
    body: extractBody(message.payload),
    from: getHeader(headers, "From") ?? null,
    to:
      toHeader === undefined
        ? []
        : toHeader
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value !== ""),
    receivedAt,
    snippet: message.snippet ?? null,
  };
}
