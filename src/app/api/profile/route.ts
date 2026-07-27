import { NextResponse } from "next/server";
import { z } from "zod";
import { accountsEnabled, getSessionProfileId, getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(40)
});

export async function GET() {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const profileId = await getSessionProfileId();
  const store = await getSessionStore();
  if (!profileId || !store) return unauthorized();
  const profile = await store.getProfile(profileId);
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts are not enabled" }, { status: 404 });
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile payload", issues: parsed.error.flatten() }, { status: 400 });
  }
  const profile = await store.updateProfileDisplayName(parsed.data.displayName);
  return NextResponse.json({ profile });
}
