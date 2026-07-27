import { NextResponse } from "next/server";
import { accountsEnabled, getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const friends = await store.listFriends();
  friends.sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));
  return NextResponse.json({ friends });
}

export async function DELETE(request: Request) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "Missing profileId" }, { status: 400 });
  await store.removeFriendship(profileId);
  return NextResponse.json({ ok: true });
}
