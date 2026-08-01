import { NextResponse } from "next/server";
import { accountsEnabled, getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

function inviteUrl(request: Request, token: string) {
  return `${new URL(request.url).origin}/friends/invite/${token}`;
}

/**
 * Create an invite link. One active link per user: creating a new one
 * replaces (deletes) any previous invites, which also cleans up expired rows.
 * There is deliberately no GET: a link is shown once at creation, like a
 * password reset link, and never listed again.
 */
export async function POST(request: Request) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const store = await getSessionStore();
  if (!store) return unauthorized();

  const existing = await store.listFriendInvites();
  for (const invite of existing) {
    await store.deleteFriendInvite(invite.token);
  }

  const invite = await store.createFriendInvite();
  return NextResponse.json({ invite, url: inviteUrl(request, invite.token) });
}

export async function DELETE(request: Request) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  await store.deleteFriendInvite(token);
  return NextResponse.json({ ok: true });
}
