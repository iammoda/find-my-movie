import { NextResponse } from "next/server";
import { accountsEnabled } from "@/lib/auth";
import { friendDisplayName } from "@/lib/displayName";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public invite lookup for the landing page: exposes only the inviter's
 * display name and validity - viewable signed-out so new users can join.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const { token } = await context.params;
  const store = getStore();
  const invite = await store.getFriendInvite(token);
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  const expired = new Date(invite.expiresAt).getTime() <= Date.now();
  const inviter = await store.getProfile(invite.inviterProfileId);
  return NextResponse.json({
    invite: {
      token: invite.token,
      inviterDisplayName: friendDisplayName(inviter?.displayName, inviter?.email) ?? "A Find My Movie user",
      expired
    }
  });
}
