import { NextResponse } from "next/server";
import { accountsEnabled, getSessionProfileId, getSessionStore, unauthorized } from "@/lib/auth";
import { friendDisplayName } from "@/lib/displayName";
import { acceptFriendInvite } from "@/lib/friends";
import { PENDING_INVITE_COOKIE } from "@/lib/pendingInvite";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const profileId = await getSessionProfileId();
  const store = await getSessionStore();
  if (!profileId || !store) return unauthorized();

  const { token } = await context.params;
  const result = await acceptFriendInvite(store, profileId, token);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    if (result.reason === "expired") return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
    return NextResponse.json({ error: "You cannot accept your own invite" }, { status: 400 });
  }

  const inviter = await store.getProfile(result.inviterProfileId);
  const response = NextResponse.json({
    ok: true,
    friend: { profileId: result.inviterProfileId, displayName: friendDisplayName(inviter?.displayName, inviter?.email) }
  });
  response.cookies.delete(PENDING_INVITE_COOKIE);
  return response;
}
