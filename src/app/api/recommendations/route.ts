import { NextResponse } from "next/server";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { generateRecommendations, recommendationRunIsFresh, recommendationRunIsReusable } from "@/lib/recommendations";
import { genreSuggestions, resolveGenre } from "@/lib/genres";
import { publicRecommendationResult, publicRecommendationRun } from "@/lib/publicMovie";
import { recommendationReadiness } from "@/lib/rating";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Full regeneration (model fit + vector retrieval + scoring) can exceed serverless defaults. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();

  const searchParams = new URL(request.url).searchParams;
  const mediaType: MediaType = searchParams.get("media") === "tv" ? "tv" : "movie";
  // "New list": bypass run reuse and exclude everything previously recommended.
  const fresh = searchParams.get("fresh") === "1";
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

  const [ratings, latestRun, hidden] = await Promise.all([
    store.listRatings(),
    store.getLatestRecommendationRun(undefined, mediaType),
    store.listHiddenRecommendations()
  ]);
  // Fast path: serve the stored run while it is still representative. A
  // single new rating no longer forces a synchronous full regeneration; the
  // response is marked stale so clients can offer an explicit refresh.
  const readiness = recommendationReadiness(ratings);
  if (!fresh && readiness.ready && latestRun && recommendationRunIsReusable(latestRun, ratings, mediaType, genre?.id ?? null)) {
    const stale = !recommendationRunIsFresh(latestRun, ratings, mediaType, genre?.id ?? null);
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
      stale,
      generatedAt: latestRun.createdAt,
      genre,
      mediaType
    });
  }

  const result = await generateRecommendations(store, undefined, undefined, {
    genreId: genre?.id,
    genreName: genre?.name,
    mediaType,
    freshOnly: fresh
  });
  return NextResponse.json({
    ...publicRecommendationResult(result),
    cached: false,
    generatedAt: result.run?.createdAt ?? null,
    genre,
    mediaType
  });
}
