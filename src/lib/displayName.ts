/**
 * Display name with the email-prefix fallback: friends should never see
 * "Unnamed friend" when an email is on file. Never exposes the full address.
 */
export function friendDisplayName(displayName: string | null | undefined, email: string | null | undefined): string | null {
  const name = displayName?.trim();
  if (name) return name;
  const prefix = email?.split("@")[0]?.trim();
  return prefix ? prefix.slice(0, 40) : null;
}
