import { NextResponse } from "next/server";
import { accountsEnabled, getSessionProfileId, getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const profileId = await getSessionProfileId();
  const store = await getSessionStore();
  if (!profileId || !store) return unauthorized();

  const { token } = await context.params;
  const invite = await store.getFriendInvite(token);
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  }
  if (invite.inviterProfileId === profileId) {
    return NextResponse.json({ error: "You cannot accept your own invite" }, { status: 400 });
  }

  await store.addFriendship(invite.inviterProfileId, invite.inviterProfileId);
  const inviter = await store.getProfile(invite.inviterProfileId);
  return NextResponse.json({ ok: true, friend: { profileId: invite.inviterProfileId, displayName: inviter?.displayName ?? null } });
}
