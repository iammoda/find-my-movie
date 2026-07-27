import { NextResponse } from "next/server";
import { accountsEnabled, getSessionProfileId, unauthorized } from "@/lib/auth";
import { getFriendCommonView } from "@/lib/friends";
import { publicMovie } from "@/lib/publicMovie";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const sessionProfileId = await getSessionProfileId();
  if (!sessionProfileId) return unauthorized();

  const { profileId } = await context.params;
  const view = await getFriendCommonView(sessionProfileId, profileId);
  if (!view) return NextResponse.json({ error: "Not friends with this profile" }, { status: 403 });

  return NextResponse.json({
    friend: view.friend,
    commonLoved: view.commonLoved.map(publicMovie),
    sharedWatchlist: view.sharedWatchlist.map(publicMovie),
    friendLovedUnseen: view.friendLovedUnseen.map(publicMovie)
  });
}
