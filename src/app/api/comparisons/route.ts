import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { publicMovie } from "@/lib/publicMovie";
import { advancePlacement } from "@/lib/rankingService";

export const dynamic = "force-dynamic";

const advanceSchema = z
  .object({
    tmdbId: z.number().int().positive(),
    comparisons: z
      .array(
        z.object({
          opponentTmdbId: z.number().int().positive(),
          preferredNew: z.boolean()
        })
      )
      .max(10),
    /** Opponent the user reports never having seen: rating removed, replaced by a not_seen exposure. */
    notSeenOpponentTmdbId: z.number().int().positive().optional()
  })
  .refine((data) => data.comparisons.length > 0 || data.notSeenOpponentTmdbId != null, {
    message: "Provide at least one comparison or a not-seen opponent"
  });

export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const comparisons = await store.listComparisons();
  return NextResponse.json({ comparisons });
}

export async function POST(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = advanceSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comparison payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // "Haven't seen it": the opponent should never have been ratable. Remove its
    // rating (it was polluting the taste model too) and record the ground truth;
    // the placement below then resolves the next opponent from the fresh bucket.
    const notSeenId = parsed.data.notSeenOpponentTmdbId;
    if (notSeenId != null && notSeenId !== parsed.data.tmdbId) {
      await store.deleteRating(notSeenId);
      await store.logExposure(notSeenId, "not_seen", "comparison-modal");
    }

    const { placement, rating } = await advancePlacement(store, parsed.data.tmdbId, parsed.data.comparisons);
    const opponent = placement.opponentTmdbId ? await store.getMovie(placement.opponentTmdbId) : null;
    return NextResponse.json({
      placement,
      rating,
      opponent: opponent ? publicMovie(opponent) : null
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Comparison failed" }, { status: 400 });
  }
}
