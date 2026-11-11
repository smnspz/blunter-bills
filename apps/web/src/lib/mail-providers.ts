/** Mail provider id supported by the setup UI. */
export type MailProviderId = "gmail" | "outlook" | "imap";

/** Provider option shown on the mail setup screen. */
export interface MailProviderOption {
  id: MailProviderId;
  name: string;
  description: string;
  available: boolean;
  monogram: string;
}

/** Providers offered by the mail setup step. */
export const MAIL_PROVIDERS: MailProviderOption[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Read-only access to your Google inbox.",
    available: true,
    monogram: "G",
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Microsoft 365 and Outlook.com.",
    available: false,
    monogram: "O",
  },
  {
    id: "imap",
    name: "IMAP",
    description: "Any provider with IMAP access.",
    available: false,
    monogram: "I",
  },
];
