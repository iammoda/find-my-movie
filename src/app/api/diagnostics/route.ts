import { NextResponse } from "next/server";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { loadTasteModel } from "@/lib/tasteModel";

export const dynamic = "force-dynamic";

/** Deck interactions counted for the recent not-seen rate. */
const RECENT_DECK_WINDOW = 200;

/**
 * Read-only health metrics so "the recommendations feel off" is diagnosable:
 * - deck: how many recent deck cards the user could not rate (not seen)
 * - model: leave-one-out prediction error on the user's own ratings, in
 *   0-10 rank-score points (derived from the ridge fit's LOO/GCV residuals)
 * - recommendations: how the user rates recommended movies vs browsed ones
 */
export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();

  const [movies, ratings, exposures, appealSignals, watchlist, runs] = await Promise.all([
    store.listMovies(),
    store.listRatings(),
    store.listExposures(),
    store.listAppealSignals(),
    store.listWatchlist(),
    store.listRecommendationRuns()
  ]);

  // Deck ratability: share of recent deck interactions marked "haven't seen".
  const deckInteractions = exposures
    .filter((exposure) => exposure.source === "taste_test" || exposure.source === "not_seen")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_DECK_WINDOW);
  const recentNotSeen = deckInteractions.filter((exposure) => exposure.source === "not_seen").length;

  // Model error: LOO residuals from the ridge fit, mapped to rank-score points.
  let modelReady = false;
  let ratingSampleCount = 0;
  let looRmseRankPoints: number | null = null;
  try {
    const { model } = await loadTasteModel(store, { movies, ratings, exposures, appealSignals, watchlist });
    if (model) {
      modelReady = true;
      ratingSampleCount = model.ratingSampleCount;
      looRmseRankPoints = Number((Math.sqrt(model.gcv) * 5).toFixed(2));
    }
  } catch {
    // Cold start / embeddings unavailable: report model as not ready.
  }

  const latestRun = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

  return NextResponse.json({
    deck: {
      recentWindow: deckInteractions.length,
      recentNotSeenRate: deckInteractions.length ? Number((recentNotSeen / deckInteractions.length).toFixed(3)) : null,
      totalRatings: ratings.length
    },
    model: {
      ready: modelReady,
      ratingSampleCount,
      looRmseRankPoints
    },
    recommendations: {
      baselineAverage: latestRun?.baselineAverage ?? null,
      recommendationAverage: latestRun?.recommendationAverage ?? null,
      lastRunAt: latestRun?.createdAt ?? null
    }
  });
}
