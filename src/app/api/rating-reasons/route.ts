import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const reasonSchema = z.object({
  tmdbId: z.number().int().positive(),
  sentiment: z.enum(["positive", "negative"]),
  reasons: z.array(z.enum(["story", "tone", "character", "pacing", "visuals_world", "ending_payoff"])).max(6)
});

export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const ratingReasons = await store.listRatingReasons();
  return NextResponse.json({ ratingReasons });
}

export async function POST(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = reasonSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rating reason payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const ratingReasons = await store.saveRatingReasons(parsed.data.tmdbId, parsed.data.reasons, parsed.data.sentiment);
  return NextResponse.json({ ratingReasons });
}
