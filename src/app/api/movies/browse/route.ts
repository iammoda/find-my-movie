import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { getPublicStore } from "@/lib/auth";
import { MEDIA_PROFILES, RUNTIME_STARTER_POOL_MOVIES, MIN_STABLE_RELEASE_DAYS } from "@/lib/constants";
import { cachedMovieEmbeddings } from "@/lib/embeddingCache";
import { handledMovieIds } from "@/lib/handled";
import { isPrimaryAudienceMovie } from "@/lib/language";
import { publicMovie } from "@/lib/publicMovie";
import { isReleasedAtLeastDaysAgo, mainstreamScore } from "@/lib/quality";
import { VERDICT_BANDS } from "@/lib/ranking";
import { type MovieStore } from "@/lib/store";
import { buildUncertaintyEstimator, discoveryWeights, loadTasteModel, predictTasteScore, predictedRankScore } from "@/lib/tasteModel";
import { buildTasteModes, type ModeSample } from "@/lib/tasteClusters";
import { buildTasteTestQueue, usableTasteTestMovie, type TasteTestQueueOptions } from "@/lib/tasteTest";
import { fetchBrowseMovies, fetchCatalogExpansion, fetchStarterPool } from "@/lib/tmdb";
import { fetchBrowseTv, fetchTvCatalogExpansion, fetchTvStarterPool } from "@/lib/tmdbTv";
import type { AppealSignal, MediaType, Movie, MovieExposure, Rating, WatchlistItem } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Cold deck builds (model fit + TMDB seeding) can exceed serverless defaults. */
export const maxDuration = 60;

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

// Background catalog growth: when the deck runs short, pull deeper TMDB pages
// so heavy raters never hit an empty deck. Throttled per server process.
const QUEUE_REPLENISH_THRESHOLD = 30;
const CATALOG_EXPANSION_MIN_INTERVAL_MS = 10 * 60 * 1000;
const CATALOG_EXPANSION_TARGET = 400;
const CATALOG_EXPANSION_PAGE_WINDOW = 500;
const lastCatalogExpansionAt: Record<MediaType, number> = { movie: 0, tv: 0 };

// First-run seeding: the full 900-title starter pool takes far too long to
// block a request on, so the deck serves a quick popular/top-rated slice
// immediately and the pool ingests in the background.
const STARTER_SEED_MIN_INTERVAL_MS = 5 * 60 * 1000;
const starterSeedState: Record<MediaType, { inFlight: boolean; lastStartedAt: number }> = {
  movie: { inFlight: false, lastStartedAt: 0 },
  tv: { inFlight: false, lastStartedAt: 0 }
};

function scheduleStarterPoolSeed(store: MovieStore, mediaType: MediaType) {
  const state = starterSeedState[mediaType];
  const now = Date.now();
  if (state.inFlight || now - state.lastStartedAt < STARTER_SEED_MIN_INTERVAL_MS) return;
  state.inFlight = true;
  state.lastStartedAt = now;
  // after(): survives the response on serverless runtimes (see maybeExpandCatalog).
  after(async () => {
    try {
      const pool =
        mediaType === "tv" ? await fetchTvStarterPool(RUNTIME_STARTER_POOL_MOVIES) : await fetchStarterPool(RUNTIME_STARTER_POOL_MOVIES);
      if (pool.length) {
        await store.upsertMovies(pool);
        console.info(`Starter pool seeded ${pool.length} ${mediaType} titles in the background`);
      }
    } catch (error) {
      console.warn("Starter pool seeding failed", error instanceof Error ? error.message : error);
    } finally {
      starterSeedState[mediaType].inFlight = false;
    }
  });
}

/** A few parallel discover pages so a cold catalog can serve a deck in seconds, not minutes. */
async function fetchQuickSeedSlice(mediaType: MediaType): Promise<Movie[]> {
  const [popular, topRated] =
    mediaType === "tv"
      ? await Promise.all([fetchBrowseTv("popular", 1), fetchBrowseTv("top_rated", 1)])
      : await Promise.all([fetchBrowseMovies("popular", 1), fetchBrowseMovies("top_rated", 1)]);
  const byId = new Map<number, Movie>();
  for (const movie of [...popular, ...topRated]) byId.set(movie.tmdbId, movie);
  return Array.from(byId.values());
}

function maybeExpandCatalog(store: MovieStore, mediaType: MediaType, catalogSize: number) {
  const now = Date.now();
  if (now - lastCatalogExpansionAt[mediaType] < CATALOG_EXPANSION_MIN_INTERVAL_MS) return;
  lastCatalogExpansionAt[mediaType] = now;
  // after(): on serverless (Vercel) a fire-and-forget promise is frozen when
  // the response is sent; after() keeps the function alive until it settles.
  after(async () => {
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
  });
}

/**
 * Model-driven deck signals: predicted rank scores for candidates, embedding
 * neighbors of the user's top-loved movies, and the model's confidence.
 * Everything degrades to empty (cold start) if the model or embeddings are out.
 */
async function deckModelSignals(
  store: MovieStore,
  mediaType: MediaType,
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
    // The taste model is shared across media: fit it on the user's signal
    // movies from BOTH catalogs, never on the deck's media-filtered catalog.
    // (Fitting on the TV catalog silently dropped every movie rating and
    // produced a 124-sample TV-only model that then leaked through the cache.)
    const signalIds = new Set<number>([
      ...ratings.map((rating) => rating.tmdbId),
      ...appealSignals.map((signal) => signal.tmdbId),
      ...watchlist.map((item) => item.tmdbId),
      ...exposures.map((exposure) => exposure.tmdbId)
    ]);
    const signalMovies = await store.getMoviesByIds([...signalIds]);
    const { model, signalEmbeddingsById } = await loadTasteModel(store, {
      movies: signalMovies,
      ratings,
      exposures,
      appealSignals,
      watchlist
    });
    if (!model) return { predictions, neighborhoodSimilarity, uncertainty, modelRatingSampleCount };
    modelRatingSampleCount = model.ratingSampleCount;

    const handledIds = handledMovieIds(ratings, exposures, appealSignals);
    const candidates = movies
      .filter((movie) => usableTasteTestMovie(movie) && !handledIds.has(movie.tmdbId))
      .slice(0, MAX_PREDICTION_CANDIDATES);

    if (candidates.length) {
      const embeddingById = await cachedMovieEmbeddings(store, candidates.map((movie) => movie.tmdbId));
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

    // Loved-neighborhood probes: unrated titles embedding-close to the user's
    // taste modes (mode centroids, so near-duplicate favorites cannot
    // double-pull one neighborhood).
    const signalMovieById = new Map(signalMovies.map((movie) => [movie.tmdbId, movie]));
    const modeWeights = discoveryWeights(ratings, signalMovieById);
    const lovedForModes: ModeSample[] = ratings
      .filter((rating) => rating.verdict === "loved" || (rating.rankScore ?? 0) >= VERDICT_BANDS.loved.min)
      .flatMap((rating) => {
        const movie = signalMovieById.get(rating.tmdbId);
        const embedding = signalEmbeddingsById.get(rating.tmdbId);
        if (!movie || !embedding?.length) return [];
        return [{ movie, rankScore: rating.rankScore ?? VERDICT_BANDS.loved.min, embedding, weight: modeWeights.get(rating.tmdbId) ?? 1 }];
      });
    const modes = buildTasteModes(lovedForModes);
    const queries = modes.length
      ? modes.slice(0, LOVED_ANCHOR_COUNT).map((mode) => mode.centroid)
      : [...ratings]
          .filter((rating) => rating.verdict === "loved" || (rating.rankScore ?? 0) >= VERDICT_BANDS.loved.min)
          .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
          .slice(0, LOVED_ANCHOR_COUNT)
          .map((rating) => signalEmbeddingsById.get(rating.tmdbId))
          .filter((vector): vector is number[] => Boolean(vector?.length));
    if (queries.length) {
      const excluded = Array.from(handledIds);
      const matches = (
        await Promise.all(queries.map((query) => store.matchMovieEmbeddings(query, NEIGHBORHOOD_MATCHES_PER_ANCHOR, excluded, mediaType)))
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
    const startedAt = Date.now();
    const [ratings, exposures, appealSignals, watchlist, initialCached] = await Promise.all([
      store.listRatings(),
      store.listExposures(),
      store.listAppealSignals(),
      store.listWatchlist(),
      store.listMovies(mediaType)
    ]);
    let cached = initialCached;
    if (cached.length < 400) {
      // Seed the full pool off the request path; serve a quick slice now if
      // the catalog cannot even fill one deck.
      scheduleStarterPoolSeed(store, mediaType);
      if (cached.length < 100) {
        try {
          const quickSlice = await fetchQuickSeedSlice(mediaType);
          if (quickSlice.length) {
            await store.upsertMovies(quickSlice);
            cached = await store.listMovies(mediaType);
          }
        } catch (error) {
          console.warn("Quick seed slice failed", error instanceof Error ? error.message : error);
        }
      }
    }

    const modelSignals = await deckModelSignals(store, mediaType, cached, ratings, exposures, appealSignals, watchlist);
    const movies = buildTasteTestQueue(cached, ratings, exposures, 80, { appealSignals, ...modelSignals });
    if (movies.length < QUEUE_REPLENISH_THRESHOLD) maybeExpandCatalog(store, mediaType, cached.length);
    const durationMs = Date.now() - startedAt;
    if (durationMs > 1000) {
      console.info(`Deck build took ${durationMs}ms (catalog ${cached.length}, ratings ${ratings.length}, ${mediaType})`);
    }
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
