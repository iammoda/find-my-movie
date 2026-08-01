import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicStore } from "@/lib/auth";
import { MEDIA_PROFILES, RUNTIME_STARTER_POOL_MOVIES, MIN_STABLE_RELEASE_DAYS } from "@/lib/constants";
import { handledMovieIds } from "@/lib/handled";
import { isPrimaryAudienceMovie } from "@/lib/language";
import { publicMovie } from "@/lib/publicMovie";
import { isReleasedAtLeastDaysAgo, mainstreamScore } from "@/lib/quality";
import { VERDICT_BANDS } from "@/lib/ranking";
import { type MovieStore } from "@/lib/store";
import { buildUncertaintyEstimator, loadTasteModel, predictTasteScore, predictedRankScore } from "@/lib/tasteModel";
import { buildTasteTestQueue, usableTasteTestMovie, type TasteTestQueueOptions } from "@/lib/tasteTest";
import { fetchBrowseMovies, fetchCatalogExpansion, fetchStarterPool } from "@/lib/tmdb";
import { fetchBrowseTv, fetchTvCatalogExpansion, fetchTvStarterPool } from "@/lib/tmdbTv";
import type { AppealSignal, MediaType, Movie, MovieExposure, Rating, WatchlistItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  category: z.enum(["taste_test", "popular", "top_rated", "genre"]).default("taste_test"),
  mediaType: z.enum(["movie", "tv"]).default("movie"),
  genreId: z.coerce.number().optional(),
  page: z.coerce.number().int().positive().default(1)
});

/** Cap the embedding fetch for deck predictions; listMovies is popularity-sorted. */
const MAX_PREDICTION_CANDIDATES = 1200;
const LOVED_ANCHOR_COUNT = 5;
const NEIGHBORHOOD_MATCHES_PER_ANCHOR = 40;

// Candidate embeddings are immutable per movie; cache them across deck loads
// so replans only fetch vectors for newly surfaced candidates.
const candidateEmbeddingCache = new Map<number, number[]>();
const CANDIDATE_EMBEDDING_CACHE_MAX = 3000;

// Background catalog growth: when the deck runs short, pull deeper TMDB pages
// so heavy raters never hit an empty deck. Throttled per server process.
const QUEUE_REPLENISH_THRESHOLD = 30;
const CATALOG_EXPANSION_MIN_INTERVAL_MS = 10 * 60 * 1000;
const CATALOG_EXPANSION_TARGET = 400;
const CATALOG_EXPANSION_PAGE_WINDOW = 500;
const lastCatalogExpansionAt: Record<MediaType, number> = { movie: 0, tv: 0 };

function maybeExpandCatalog(store: MovieStore, mediaType: MediaType, catalogSize: number) {
  const now = Date.now();
  if (now - lastCatalogExpansionAt[mediaType] < CATALOG_EXPANSION_MIN_INTERVAL_MS) return;
  lastCatalogExpansionAt[mediaType] = now;
  void (async () => {
    try {
      const pageOffset = Math.floor(catalogSize / CATALOG_EXPANSION_PAGE_WINDOW);
      const fresh =
        mediaType === "tv"
          ? await fetchTvCatalogExpansion(pageOffset, CATALOG_EXPANSION_TARGET)
          : await fetchCatalogExpansion(pageOffset, CATALOG_EXPANSION_TARGET);
      if (fresh.length) {
        await store.upsertMovies(fresh);
        console.info(`Catalog expansion ingested ${fresh.length} ${mediaType} titles (page offset ${pageOffset})`);
      }
    } catch (error) {
      console.warn("Catalog expansion failed", error instanceof Error ? error.message : error);
    }
  })();
}

async function candidateEmbeddings(store: MovieStore, tmdbIds: number[]): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  const missing: number[] = [];
  for (const tmdbId of tmdbIds) {
    const cached = candidateEmbeddingCache.get(tmdbId);
    if (cached) result.set(tmdbId, cached);
    else missing.push(tmdbId);
  }
  if (missing.length) {
    const fetched = await store.listMovieEmbeddings(missing);
    if (candidateEmbeddingCache.size + fetched.length > CANDIDATE_EMBEDDING_CACHE_MAX) candidateEmbeddingCache.clear();
    for (const embedding of fetched) {
      candidateEmbeddingCache.set(embedding.tmdbId, embedding.embedding);
      result.set(embedding.tmdbId, embedding.embedding);
    }
  }
  return result;
}

/**
 * Model-driven deck signals: predicted rank scores for candidates, embedding
 * neighbors of the user's top-loved movies, and the model's confidence.
 * Everything degrades to empty (cold start) if the model or embeddings are out.
 */
async function deckModelSignals(
  store: MovieStore,
  movies: Movie[],
  ratings: Rating[],
  exposures: MovieExposure[],
  appealSignals: AppealSignal[],
  watchlist: WatchlistItem[]
): Promise<Pick<TasteTestQueueOptions, "predictions" | "neighborhoodSimilarity" | "uncertainty" | "modelRatingSampleCount">> {
  const predictions = new Map<number, number>();
  const neighborhoodSimilarity = new Map<number, number>();
  const uncertainty = new Map<number, number>();
  let modelRatingSampleCount = 0;
  try {
    const { model, signalEmbeddingsById } = await loadTasteModel(store, { movies, ratings, exposures, appealSignals, watchlist });
    if (!model) return { predictions, neighborhoodSimilarity, uncertainty, modelRatingSampleCount };
    modelRatingSampleCount = model.ratingSampleCount;

    const handledIds = handledMovieIds(ratings, exposures, appealSignals);
    const candidates = movies
      .filter((movie) => usableTasteTestMovie(movie) && !handledIds.has(movie.tmdbId))
      .slice(0, MAX_PREDICTION_CANDIDATES);

    if (candidates.length) {
      const embeddingById = await candidateEmbeddings(store, candidates.map((movie) => movie.tmdbId));
      // Uncertainty anchors: the most decisive rated embeddings first.
      const anchorVectors = [...ratings]
        .sort((a, b) => Math.abs((b.rankScore ?? 5) - 5) - Math.abs((a.rankScore ?? 5) - 5))
        .map((rating) => signalEmbeddingsById.get(rating.tmdbId))
        .filter((vector): vector is number[] => Boolean(vector?.length));
      const estimateUncertainty = buildUncertaintyEstimator(anchorVectors);
      for (const movie of candidates) {
        const embedding = embeddingById.get(movie.tmdbId);
        if (!embedding?.length) continue; // trait-only predictions are too weak to probe with
        predictions.set(movie.tmdbId, predictedRankScore(predictTasteScore(model, embedding, movie)));
        if (anchorVectors.length) uncertainty.set(movie.tmdbId, estimateUncertainty(embedding));
      }
    }

    // Loved-neighborhood probes: unrated movies embedding-close to the top-loved.
    const topLoved = [...ratings]
      .filter((rating) => rating.verdict === "loved" || (rating.rankScore ?? 0) >= VERDICT_BANDS.loved.min)
      .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
      .slice(0, LOVED_ANCHOR_COUNT);
    const queries = topLoved
      .map((rating) => signalEmbeddingsById.get(rating.tmdbId))
      .filter((vector): vector is number[] => Boolean(vector?.length));
    if (queries.length) {
      const excluded = Array.from(handledIds);
      const matches = (
        await Promise.all(queries.map((query) => store.matchMovieEmbeddings(query, NEIGHBORHOOD_MATCHES_PER_ANCHOR, excluded)))
      ).flat();
      for (const match of matches) {
        neighborhoodSimilarity.set(match.tmdbId, Math.max(neighborhoodSimilarity.get(match.tmdbId) ?? 0, match.similarity));
      }
    }
  } catch (error) {
    console.warn("Deck taste signals unavailable", error instanceof Error ? error.message : error);
  }
  return { predictions, neighborhoodSimilarity, uncertainty, modelRatingSampleCount };
}

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid browse query", issues: parsed.error.flatten() }, { status: 400 });
  }
  const mediaType = parsed.data.mediaType;
  const profile = MEDIA_PROFILES[mediaType];

  // Signed in: deck personalization reads the session profile.
  // Signed out: the empty "anon" profile, so decks behave like a fresh user.
  const store = await getPublicStore();

  if (parsed.data.category === "taste_test") {
    const [ratings, exposures, appealSignals, watchlist, initialCached] = await Promise.all([
      store.listRatings(),
      store.listExposures(),
      store.listAppealSignals(),
      store.listWatchlist(),
      store.listMovies(mediaType)
    ]);
    let cached = initialCached;
    if (cached.length < 400) {
      const starterPool =
        mediaType === "tv" ? await fetchTvStarterPool(RUNTIME_STARTER_POOL_MOVIES) : await fetchStarterPool(RUNTIME_STARTER_POOL_MOVIES);
      await store.upsertMovies(starterPool);
      cached = await store.listMovies(mediaType);
    }

    const modelSignals = await deckModelSignals(store, cached, ratings, exposures, appealSignals, watchlist);
    const movies = buildTasteTestQueue(cached, ratings, exposures, 80, { appealSignals, ...modelSignals });
    if (movies.length < QUEUE_REPLENISH_THRESHOLD) maybeExpandCatalog(store, mediaType, cached.length);
    return NextResponse.json({ movies: movies.map(publicMovie), page: parsed.data.page, source: parsed.data.category });
  }

  const fetched =
    mediaType === "tv"
      ? await fetchBrowseTv(parsed.data.category, parsed.data.page, parsed.data.genreId)
      : await fetchBrowseMovies(parsed.data.category, parsed.data.page, parsed.data.genreId);
  await store.upsertMovies(fetched);

  const [ratings, exposures, appealSignals, cached] = await Promise.all([
    store.listRatings(),
    store.listExposures(),
    store.listAppealSignals(),
    store.listMovies(mediaType)
  ]);
  const handledIds = handledMovieIds(ratings, exposures, appealSignals);
  const fetchedIds = new Set(fetched.map((movie) => movie.tmdbId));

  const minVotes =
    parsed.data.category === "top_rated"
      ? profile.minTopRatedVoteCount
      : parsed.data.category === "genre"
        ? profile.minGenreVoteCount
        : profile.minBrowseVoteCount;
  const minReleaseAgeDays = parsed.data.category === "popular" ? 0 : MIN_STABLE_RELEASE_DAYS;

  let movies = cached.filter(
    (movie) =>
      fetchedIds.has(movie.tmdbId) &&
      !handledIds.has(movie.tmdbId) &&
      !movie.adult &&
      Boolean(movie.posterPath) &&
      Boolean(movie.overview) &&
      movie.voteCount >= minVotes &&
      movie.popularity >= profile.minBrowsePopularity &&
      isReleasedAtLeastDaysAgo(movie.releaseDate, minReleaseAgeDays) &&
      isPrimaryAudienceMovie(movie)
  );
  if (parsed.data.category === "genre" && parsed.data.genreId) {
    movies = movies.filter((movie) => movie.genres.some((genre) => genre.id === parsed.data.genreId));
  }
  if (parsed.data.category === "top_rated" || parsed.data.category === "genre") {
    movies.sort((a, b) => mainstreamScore(b) - mainstreamScore(a));
  } else {
    movies.sort((a, b) => b.popularity - a.popularity);
  }

  return NextResponse.json({ movies: movies.map(publicMovie), page: parsed.data.page, source: parsed.data.category });
}
