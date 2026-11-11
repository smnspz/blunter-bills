export { createGmailReader, GmailReader } from "./adapters/gmail/gmail-reader.js";
export type {
  GmailOAuthReaderConfig,
  GmailReaderConfig,
  GmailReaderOptions,
  GmailTokenReaderConfig,
} from "./adapters/gmail/gmail-reader.js";
export { createRefreshTokenProvider } from "./adapters/gmail/gmail-auth.js";
export type { RefreshTokenProviderOptions } from "./adapters/gmail/gmail-auth.js";
export {
  createGmailAuthorizationUrl,
  exchangeGmailAuthorizationCode,
  GMAIL_READONLY_SCOPE,
} from "./adapters/gmail/gmail-oauth.js";
export type {
  ExchangeGmailAuthorizationCodeOptions,
  GmailAuthorizationUrlOptions,
  GmailTokens,
} from "./adapters/gmail/gmail-oauth.js";
export { MailError } from "./core/errors.js";
export type { MailErrorCode } from "./core/errors.js";
export type { EmailMessage, ReadMessagesOptions } from "./core/email.js";
export type { MailReader } from "./core/mail-reader.js";
export type { AccessTokenProvider } from "./core/access-token.js";
