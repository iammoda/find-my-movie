import { NextResponse } from "next/server";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { generateRecommendations, recommendationRunIsFresh } from "@/lib/recommendations";
import { genreSuggestions, resolveGenre } from "@/lib/genres";
import { publicRecommendationResult, publicRecommendationRun } from "@/lib/publicMovie";
import { recommendationReadiness } from "@/lib/rating";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();

  const searchParams = new URL(request.url).searchParams;
  const mediaType: MediaType = searchParams.get("media") === "tv" ? "tv" : "movie";
  const genreInput = searchParams.get("genre")?.trim() ?? "";
  let genre: ReturnType<typeof resolveGenre> = null;
  if (genreInput) {
    genre = resolveGenre(genreInput, mediaType);
    if (!genre) {
      return NextResponse.json(
        { error: `Unknown genre "${genreInput}".`, suggestions: genreSuggestions(mediaType) },
        { status: 400 }
      );
    }
  }

  // Fast path: no new ratings since the last run for this media -> serve it.
  const [ratings, latestRun, hidden] = await Promise.all([
    store.listRatings(),
    store.getLatestRecommendationRun(undefined, mediaType),
    store.listHiddenRecommendations()
  ]);
  const readiness = recommendationReadiness(ratings);
  if (readiness.ready && latestRun && recommendationRunIsFresh(latestRun, ratings, mediaType, genre?.id ?? null)) {
    const hiddenIds = new Set(hidden);
    const run = publicRecommendationRun({
      ...latestRun,
      items: latestRun.items.filter((item) => !hiddenIds.has(item.tmdbId))
    });
    return NextResponse.json({
      ready: true,
      readiness,
      run,
      recommendations: run.items,
      fallback: Boolean((latestRun.metadata as { fallback?: boolean } | null)?.fallback),
      cached: true,
      generatedAt: latestRun.createdAt,
      genre,
      mediaType
    });
  }

  const result = await generateRecommendations(store, undefined, undefined, {
    genreId: genre?.id,
    genreName: genre?.name,
    mediaType
  });
  return NextResponse.json({
    ...publicRecommendationResult(result),
    cached: false,
    generatedAt: result.run?.createdAt ?? null,
    genre,
    mediaType
  });
}
