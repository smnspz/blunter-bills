/**
 * Shared querystring schema for OAuth callback routes.
 */
export const oauthCallbackQuerySchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    code: { type: "string" },
    state: { type: "string" },
    error: { type: "string" },
    error_description: { type: "string" },
  },
} as const;
