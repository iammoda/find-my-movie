import { NextResponse } from "next/server";
import { accountsEnabled, getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

function inviteUrl(request: Request, token: string) {
  return `${new URL(request.url).origin}/friends/invite/${token}`;
}

export async function POST(request: Request) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const invite = await store.createFriendInvite();
  return NextResponse.json({ invite, url: inviteUrl(request, invite.token) });
}

export async function GET(request: Request) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const now = Date.now();
  const invites = (await store.listFriendInvites()).filter((invite) => new Date(invite.expiresAt).getTime() > now);
  return NextResponse.json({
    invites: invites.map((invite) => ({ ...invite, url: inviteUrl(request, invite.token) }))
  });
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
