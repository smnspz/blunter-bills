/**
 * Maps mail callback error codes to user-facing copy.
 *
 * @param code - Error code from the API redirect.
 * @returns A user-facing message, or null when no code was provided.
 */
export function mailErrorMessage(code: string | null): string | null {
  if (code === null) return null;

  switch (code) {
    case "AUTH_FAILED":
      return "Google rejected the authorization. Please try again.";
    case "TRANSPORT_ERROR":
      return "Could not reach Google. Please try again.";
    case "invalid_state":
      return "This authorization link expired. Start again.";
    case "no_refresh_token":
      return "Google did not return a refresh token. Revoke the app's access and retry.";
    case "missing_code":
      return "Google did not return an authorization code.";
    case "missing_state":
      return "Missing OAuth state. Start again.";
    case "mail_auth_failed":
      return "Gmail connection failed. Please try again.";
    default:
      return code;
  }
}
