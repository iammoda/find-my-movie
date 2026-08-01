import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accountsEnabled, getSessionProfileId, getSessionStore, unauthorized } from "@/lib/auth";
import { acceptFriendInvite } from "@/lib/friends";
import { PENDING_INVITE_COOKIE } from "@/lib/pendingInvite";

export const dynamic = "force-dynamic";

/**
 * Consume the pending-invite cookie after signup/login: if the visitor opened
 * a friend invite before authenticating, the friendship is created here
 * automatically so they never have to open the link a second time.
 */
export async function POST() {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const profileId = await getSessionProfileId();
  const store = await getSessionStore();
  if (!profileId || !store) return unauthorized();

  const token = (await cookies()).get(PENDING_INVITE_COOKIE)?.value;
  if (!token) return NextResponse.json({ accepted: false });

  const result = await acceptFriendInvite(store, profileId, token);
  const response = NextResponse.json({ accepted: result.ok });
  // One-shot: clear the cookie whether or not the invite was still valid.
  response.cookies.delete(PENDING_INVITE_COOKIE);
  return response;
}
