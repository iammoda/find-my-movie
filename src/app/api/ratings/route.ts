import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { publicMovie } from "@/lib/publicMovie";
import { beginPlacement } from "@/lib/rankingService";

export const dynamic = "force-dynamic";

const legacyRatingSchema = z.object({
  tmdbId: z.number().int().positive(),
  rating: z.enum(["best_ever", "like", "skip", "dislike", "hate"])
});

const verdictSchema = z.object({
  tmdbId: z.number().int().positive(),
  verdict: z.enum(["loved", "fine", "disliked"])
});

/** Exact restore (undo): writes verdict + rank score directly, no placement flow. */
const restoreSchema = z.object({
  tmdbId: z.number().int().positive(),
  rating: z.enum(["best_ever", "like", "skip", "dislike", "hate"]),
  verdict: z.enum(["loved", "fine", "disliked"]).nullable(),
  rankScore: z.number().min(0).max(10).nullable()
});

export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const ratings = await store.listRatings();
  return NextResponse.json({ ratings });
}

export async function POST(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);

  const restoreParsed = restoreSchema.safeParse(json);
  if (restoreParsed.success && (json as Record<string, unknown>)?.rankScore !== undefined) {
    const rating = await store.upsertRating(restoreParsed.data.tmdbId, restoreParsed.data.rating, undefined, {
      verdict: restoreParsed.data.verdict,
      rankScore: restoreParsed.data.rankScore
    });
    return NextResponse.json({ rating });
  }

  const verdictParsed = verdictSchema.safeParse(json);
  if (verdictParsed.success) {
    const { rating, previousRating, placement } = await beginPlacement(store, verdictParsed.data.tmdbId, verdictParsed.data.verdict);
    const opponent = placement.opponentTmdbId ? await store.getMovie(placement.opponentTmdbId) : null;
    return NextResponse.json({
      rating,
      previousRating,
      placement,
      opponent: opponent ? publicMovie(opponent) : null
    });
  }

  const parsed = legacyRatingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rating payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const existing = (await store.listRatings()).find((rating) => rating.tmdbId === parsed.data.tmdbId) ?? null;
  const rating = await store.upsertRating(parsed.data.tmdbId, parsed.data.rating);
  return NextResponse.json({ rating, previousRating: existing });
}

export async function DELETE(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const tmdbId = Number(new URL(request.url).searchParams.get("tmdbId"));
  if (!Number.isFinite(tmdbId)) return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  await store.deleteRating(tmdbId);
  return NextResponse.json({ ok: true });
}
