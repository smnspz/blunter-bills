import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeMimeWords, extractBody, stripHtml } from "../src/adapters/gmail/gmail-mime.js";

/**
 * Encodes a string as base64url.
 *
 * @param value - Input string.
 * @returns Base64url text.
 */
function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("Gmail MIME", () => {
  it("decodes base64 encoded words", () => {
    assert.equal(decodeMimeWords("=?UTF-8?B?SGVsbG8gZnJvbSBBbGljZQ==?="), "Hello from Alice");
  });

  it("decodes Q encoded words", () => {
    assert.equal(decodeMimeWords("=?ISO-8859-1?Q?Caf=E9?="), "Café");
  });

  it("prefers plain text over HTML", () => {
    const body = extractBody({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: base64Url("plain body") } },
        { mimeType: "text/html", body: { data: base64Url("<p>html body</p>") } },
      ],
    });

    assert.equal(body, "plain body");
  });

  it("falls back to stripped HTML", () => {
    const body = extractBody({
      mimeType: "text/html",
      body: { data: base64Url("<p>Hello <b>world</b></p>") },
    });

    assert.equal(body, "Hello world");
  });

  it("walks nested multipart messages", () => {
    const body = extractBody({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: base64Url("nested plain") } },
            { mimeType: "text/html", body: { data: base64Url("<p>nested html</p>") } },
          ],
        },
        { mimeType: "application/pdf", body: {} },
      ],
    });

    assert.equal(body, "nested plain");
  });

  it("returns an empty body when no text parts exist", () => {
    assert.equal(extractBody({ mimeType: "application/pdf", body: {} }), "");
    assert.equal(extractBody(undefined), "");
  });

  it("strips HTML entities and whitespace", () => {
    assert.equal(stripHtml("<p>Hello&nbsp;&amp; welcome</p>"), "Hello & welcome");
  });
});
