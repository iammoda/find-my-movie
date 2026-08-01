/**
 * Invite handoff cookie: set by the middleware when a signed-out visitor opens
 * an invite link, consumed after signup/login so the friendship is created
 * automatically - even across the email-confirmation detour - without the
 * user having to open the invite link a second time.
 */
export const PENDING_INVITE_COOKIE = "pending_friend_invite";
export const PENDING_INVITE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
