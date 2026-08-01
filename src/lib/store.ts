import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROFILE_ID, ANONYMOUS_PROFILE_ID, MAX_CATALOG_ROWS } from "@/lib/constants";
import { FALLBACK_MOVIES } from "@/lib/data/fallbackMovies";
import { friendDisplayName } from "@/lib/displayName";
import { deriveTasteFacts } from "@/lib/taste";
import { mediaTypeOfId, sourceIdOf } from "@/lib/mediaId";
import type {
  AppealSignal,
  AppealSignalValue,
  Comparison,
  ExportPayload,
  ExposureBehavior,
  Friend,
  FriendInvite,
  MediaType,
  Movie,
  MovieCredit,
  MovieEmbedding,
  MovieEmbeddingMatch,
  MovieEnrichment,
  MovieExposure,
  Profile,
  Rating,
  RatingReason,
  RatingReasonSentiment,
  RatingReasonValue,
  RatingTraitReason,
  RatingValue,
  RecommendationItem,
  RecommendationRun,
  RecommendationScoreBreakdown,
  TasteFact,
  TaxonomyEmbedding,
  Verdict,
  WatchlistItem,
  WatchlistStatus
} from "@/lib/types";

interface StoreState {
  movies: Movie[];
  movieEmbeddings: MovieEmbedding[];
  ratings: Rating[];
  ratingReasons: RatingReason[];
  ratingTraitReasons: RatingTraitReason[];
  exposures: MovieExposure[];
  comparisons: Comparison[];
  appealSignals: AppealSignal[];
  watchlist: WatchlistItem[];
  movieEnrichments: MovieEnrichment[];
  taxonomyEmbeddings: TaxonomyEmbedding[];
  recommendationRuns: RecommendationRun[];
  hiddenRecommendations: number[];
  profiles: Profile[];
  friendInvites: FriendInvite[];
  friendships: { profileA: string; profileB: string; invitedBy: string | null; createdAt: string }[];
}

interface RecommendationItemInput {
  tmdbId: number;
  movie: Movie;
  rank: number;
  score: number;
  baselineScore: number;
  scoreBreakdown: RecommendationScoreBreakdown;
  explanation: string;
}

interface RecommendationRunInput {
  status: RecommendationRun["status"];
  promptVersion: string;
  scoringVersion: string;
  baselineAverage?: number | null;
  recommendationAverage?: number | null;
  metadata?: Record<string, unknown>;
  items: RecommendationItemInput[];
}

export interface RatingUpsertOptions {
  verdict?: Verdict | null;
  rankScore?: number | null;
}

export interface RatingRankUpdate {
  tmdbId: number;
  verdict: Verdict;
  rankScore: number;
}

export interface MovieStore {
  listMovies(mediaType?: MediaType): Promise<Movie[]>;
  getMovie(tmdbId: number): Promise<Movie | null>;
  /** Targeted catalog read: only the requested ids, avoiding the full-catalog scan. */
  getMoviesByIds(tmdbIds: number[]): Promise<Movie[]>;
  listMovieCredits(tmdbIds: number[]): Promise<MovieCredit[]>;
  upsertMovies(movies: Movie[]): Promise<void>;
  replaceTasteFactsForSource(source: TasteFact["source"], facts: TasteFact[]): Promise<void>;
  replaceTasteFactsForMovie(tmdbId: number, source: TasteFact["source"], facts: TasteFact[]): Promise<void>;
  listRatings(profileId?: string): Promise<Rating[]>;
  upsertRating(tmdbId: number, rating: RatingValue, profileId?: string, options?: RatingUpsertOptions): Promise<Rating>;
  updateRatingRanks(updates: RatingRankUpdate[], profileId?: string): Promise<void>;
  deleteRating(tmdbId: number, profileId?: string): Promise<void>;
  listComparisons(profileId?: string): Promise<Comparison[]>;
  addComparison(winnerTmdbId: number, loserTmdbId: number, profileId?: string): Promise<Comparison>;
  listAppealSignals(profileId?: string): Promise<AppealSignal[]>;
  upsertAppealSignal(tmdbId: number, signal: AppealSignalValue, profileId?: string): Promise<AppealSignal>;
  deleteAppealSignal(tmdbId: number, profileId?: string): Promise<void>;
  listRatingReasons(profileId?: string): Promise<RatingReason[]>;
  saveRatingReasons(
    tmdbId: number,
    reasons: RatingReasonValue[],
    sentiment: RatingReasonSentiment,
    profileId?: string
  ): Promise<RatingReason[]>;
  listRatingTraitReasons(profileId?: string): Promise<RatingTraitReason[]>;
  saveRatingTraitReasons(
    tmdbId: number,
    traitIds: string[],
    sentiment: RatingReasonSentiment,
    profileId?: string
  ): Promise<RatingTraitReason[]>;
  logExposure(tmdbId: number, source: MovieExposure["source"], sourceDetail?: string | null, profileId?: string): Promise<MovieExposure>;
  /** Batch exposure logging: one write for a whole recommendation run. */
  logExposures(
    entries: Array<{ tmdbId: number; source: MovieExposure["source"]; sourceDetail?: string | null }>,
    profileId?: string
  ): Promise<void>;
  updateExposureBehavior(exposureId: string, behavior: ExposureBehavior, profileId?: string): Promise<void>;
  listExposures(profileId?: string): Promise<MovieExposure[]>;
  deleteExposures(tmdbId: number, source: MovieExposure["source"], profileId?: string): Promise<void>;
  listMovieEmbeddings(tmdbIds?: number[]): Promise<MovieEmbedding[]>;
  upsertMovieEmbedding(embedding: MovieEmbedding): Promise<void>;
  matchMovieEmbeddings(
    queryEmbedding: number[],
    matchCount: number,
    excludeTmdbIds?: number[],
    mediaType?: MediaType
  ): Promise<MovieEmbeddingMatch[]>;
  hideRecommendation(tmdbId: number, reason?: string | null, profileId?: string): Promise<void>;
  listHiddenRecommendations(profileId?: string): Promise<number[]>;
  saveRecommendationRun(input: RecommendationRunInput, profileId?: string): Promise<RecommendationRun>;
  listRecommendationRuns(profileId?: string): Promise<RecommendationRun[]>;
  /** Newest run only, hydrated by item ids - no full-catalog scan. */
  getLatestRecommendationRun(profileId?: string): Promise<RecommendationRun | null>;
  listWatchlist(profileId?: string): Promise<WatchlistItem[]>;
  upsertWatchlistItem(tmdbId: number, status: WatchlistStatus, profileId?: string): Promise<WatchlistItem>;
  removeWatchlistItem(tmdbId: number, profileId?: string): Promise<void>;
  getMovieEnrichment(tmdbId: number): Promise<MovieEnrichment | null>;
  listMovieEnrichments(): Promise<MovieEnrichment[]>;
  saveMovieEnrichment(enrichment: MovieEnrichment): Promise<void>;
  listTaxonomyEmbeddings(version?: string): Promise<TaxonomyEmbedding[]>;
  saveTaxonomyEmbeddings(embeddings: TaxonomyEmbedding[]): Promise<void>;
  getProfile(profileId: string): Promise<Profile | null>;
  updateProfileDisplayName(displayName: string, profileId?: string): Promise<Profile>;
  createFriendInvite(profileId?: string): Promise<FriendInvite>;
  getFriendInvite(token: string): Promise<FriendInvite | null>;
  listFriendInvites(profileId?: string): Promise<FriendInvite[]>;
  deleteFriendInvite(token: string, profileId?: string): Promise<void>;
  /** Creates (or no-ops on) the canonical friendship pair between the two profiles. */
  addFriendship(otherProfileId: string, invitedBy: string | null, profileId?: string): Promise<void>;
  listFriends(profileId?: string): Promise<Friend[]>;
  removeFriendship(otherProfileId: string, profileId?: string): Promise<void>;
  reset(profileId?: string): Promise<void>;
  exportData(profileId?: string): Promise<ExportPayload>;
}

function now() {
  return new Date().toISOString();
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function withFacts(movie: Movie): Movie {
  return {
    ...movie,
    tasteFacts: deriveTasteFacts(movie)
  };
}

function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }

  if (!aMagnitude || !bMagnitude) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function initialState(): StoreState {
  return {
    movies: FALLBACK_MOVIES.map(withFacts),
    movieEmbeddings: [],
    ratings: [],
    ratingReasons: [],
    ratingTraitReasons: [],
    exposures: [],
    comparisons: [],
    appealSignals: [],
    watchlist: [],
    movieEnrichments: [],
    taxonomyEmbeddings: [],
    recommendationRuns: [],
    hiddenRecommendations: [],
    profiles: [{ id: DEFAULT_PROFILE_ID, email: null, displayName: null }],
    friendInvites: [],
    friendships: []
  };
}

/** Friendship rows store the pair in canonical (sorted) order. */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function localStorePath() {
  return path.join(process.cwd(), ".data", "mvp-store.json");
}

class LocalJsonStore implements MovieStore {
  private filePath = localStorePath();

  private async read(): Promise<StoreState> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreState;
      return {
        ...initialState(),
        ...parsed,
        movies: parsed.movies?.length ? parsed.movies.map(withFacts) : initialState().movies,
        movieEmbeddings: parsed.movieEmbeddings ?? [],
        ratingReasons: parsed.ratingReasons ?? [],
        ratingTraitReasons: parsed.ratingTraitReasons ?? [],
        comparisons: parsed.comparisons ?? [],
        appealSignals: parsed.appealSignals ?? [],
        watchlist: parsed.watchlist ?? [],
        movieEnrichments: parsed.movieEnrichments ?? [],
        taxonomyEmbeddings: parsed.taxonomyEmbeddings ?? [],
        profiles: parsed.profiles ?? initialState().profiles,
        friendInvites: parsed.friendInvites ?? [],
        friendships: parsed.friendships ?? []
      };
    } catch {
      const state = initialState();
      await this.write(state);
      return state;
    }
  }

  private async write(state: StoreState) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }

  async listMovies(mediaType?: MediaType) {
    const state = await this.read();
    if (!mediaType) return state.movies;
    return state.movies.filter((movie) => (movie.mediaType ?? "movie") === mediaType);
  }

  async getMovie(tmdbId: number) {
    const state = await this.read();
    return state.movies.find((movie) => movie.tmdbId === tmdbId) ?? null;
  }

  async getMoviesByIds(tmdbIds: number[]) {
    const state = await this.read();
    const wanted = new Set(tmdbIds);
    return state.movies.filter((movie) => wanted.has(movie.tmdbId));
  }

  async listMovieCredits(tmdbIds: number[]) {
    const state = await this.read();
    const wanted = new Set(tmdbIds);
    return state.movies
      .filter((movie) => wanted.has(movie.tmdbId) && movie.credits)
      .map((movie) => movie.credits as MovieCredit);
  }

  async upsertMovies(movies: Movie[]) {
    const state = await this.read();
    const byId = new Map(state.movies.map((movie) => [movie.tmdbId, movie]));
    for (const movie of movies) {
      byId.set(movie.tmdbId, withFacts({ ...byId.get(movie.tmdbId), ...movie, updatedAt: now() }));
    }
    state.movies = Array.from(byId.values());
    await this.write(state);
  }

  async replaceTasteFactsForSource(source: TasteFact["source"], facts: TasteFact[]) {
    const state = await this.read();
    const factsByMovie = new Map<number, TasteFact[]>();
    for (const fact of facts) {
      const bucket = factsByMovie.get(fact.tmdbId) ?? [];
      bucket.push(fact);
      factsByMovie.set(fact.tmdbId, bucket);
    }

    state.movies = state.movies.map((movie) =>
      withFacts({
        ...movie,
        tasteFacts: [...(movie.tasteFacts ?? []).filter((fact) => fact.source !== source), ...(factsByMovie.get(movie.tmdbId) ?? [])]
      })
    );
    await this.write(state);
  }

  async replaceTasteFactsForMovie(tmdbId: number, source: TasteFact["source"], facts: TasteFact[]) {
    const state = await this.read();
    state.movies = state.movies.map((movie) => {
      if (movie.tmdbId !== tmdbId) return movie;
      return withFacts({
        ...movie,
        tasteFacts: [...(movie.tasteFacts ?? []).filter((fact) => fact.source !== source), ...facts]
      });
    });
    await this.write(state);
  }

  async listRatings(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.ratings.filter((rating) => rating.profileId === profileId);
  }

  async upsertRating(tmdbId: number, rating: RatingValue, profileId = DEFAULT_PROFILE_ID, options?: RatingUpsertOptions) {
    const state = await this.read();
    const existing = state.ratings.find((item) => item.profileId === profileId && item.tmdbId === tmdbId);
    const current = now();
    const next: Rating = existing
      ? {
          ...existing,
          rating,
          verdict: options?.verdict !== undefined ? options.verdict : existing.verdict ?? null,
          rankScore: options?.rankScore !== undefined ? options.rankScore : existing.rankScore ?? null,
          updatedAt: current
        }
      : {
          profileId,
          tmdbId,
          rating,
          verdict: options?.verdict ?? null,
          rankScore: options?.rankScore ?? null,
          mediaType: mediaTypeOfId(tmdbId),
          createdAt: current,
          updatedAt: current
        };

    state.ratings = existing
      ? state.ratings.map((item) => (item.profileId === profileId && item.tmdbId === tmdbId ? next : item))
      : [...state.ratings, next];
    await this.write(state);
    return next;
  }

  async updateRatingRanks(updates: RatingRankUpdate[], profileId = DEFAULT_PROFILE_ID) {
    if (!updates.length) return;
    const state = await this.read();
    const byId = new Map(updates.map((update) => [update.tmdbId, update]));
    const current = now();
    state.ratings = state.ratings.map((item) => {
      if (item.profileId !== profileId) return item;
      const update = byId.get(item.tmdbId);
      if (!update) return item;
      return { ...item, verdict: update.verdict, rankScore: update.rankScore, updatedAt: current };
    });
    await this.write(state);
  }

  async deleteRating(tmdbId: number, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    state.ratings = state.ratings.filter((item) => !(item.profileId === profileId && item.tmdbId === tmdbId));
    state.ratingReasons = state.ratingReasons.filter((item) => !(item.profileId === profileId && item.tmdbId === tmdbId));
    state.ratingTraitReasons = state.ratingTraitReasons.filter((item) => !(item.profileId === profileId && item.tmdbId === tmdbId));
    state.comparisons = state.comparisons.filter(
      (item) => !(item.profileId === profileId && (item.winnerTmdbId === tmdbId || item.loserTmdbId === tmdbId))
    );
    await this.write(state);
  }

  async listComparisons(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.comparisons.filter((comparison) => comparison.profileId === profileId);
  }

  async addComparison(winnerTmdbId: number, loserTmdbId: number, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    const comparison: Comparison = {
      id: crypto.randomUUID(),
      profileId,
      winnerTmdbId,
      loserTmdbId,
      createdAt: now()
    };
    state.comparisons.push(comparison);
    await this.write(state);
    return comparison;
  }

  async listAppealSignals(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.appealSignals.filter((signal) => signal.profileId === profileId);
  }

  async upsertAppealSignal(tmdbId: number, signal: AppealSignalValue, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    const existing = state.appealSignals.find((item) => item.profileId === profileId && item.tmdbId === tmdbId);
    const current = now();
    const next: AppealSignal = existing
      ? { ...existing, signal, updatedAt: current }
      : { profileId, tmdbId, signal, createdAt: current, updatedAt: current };
    state.appealSignals = existing
      ? state.appealSignals.map((item) => (item.profileId === profileId && item.tmdbId === tmdbId ? next : item))
      : [...state.appealSignals, next];
    await this.write(state);
    return next;
  }

  async deleteAppealSignal(tmdbId: number, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    state.appealSignals = state.appealSignals.filter((item) => !(item.profileId === profileId && item.tmdbId === tmdbId));
    await this.write(state);
  }

  async listRatingReasons(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.ratingReasons.filter((reason) => reason.profileId === profileId);
  }

  async saveRatingReasons(
    tmdbId: number,
    reasons: RatingReasonValue[],
    sentiment: RatingReasonSentiment,
    profileId = DEFAULT_PROFILE_ID
  ) {
    const state = await this.read();
    const current = now();
    const uniqueReasons = Array.from(new Set(reasons));
    state.ratingReasons = state.ratingReasons.filter(
      (item) => !(item.profileId === profileId && item.tmdbId === tmdbId && item.sentiment === sentiment)
    );
    const next = uniqueReasons.map((reason) => ({
      id: crypto.randomUUID(),
      profileId,
      tmdbId,
      reason,
      sentiment,
      createdAt: current
    }));
    state.ratingReasons.push(...next);
    await this.write(state);
    return next;
  }

  async listRatingTraitReasons(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.ratingTraitReasons.filter((reason) => reason.profileId === profileId);
  }

  async saveRatingTraitReasons(
    tmdbId: number,
    traitIds: string[],
    sentiment: RatingReasonSentiment,
    profileId = DEFAULT_PROFILE_ID
  ) {
    const state = await this.read();
    const current = now();
    const uniqueTraitIds = Array.from(new Set(traitIds));
    state.ratingTraitReasons = state.ratingTraitReasons.filter(
      (item) => !(item.profileId === profileId && item.tmdbId === tmdbId && item.sentiment === sentiment)
    );
    const next = uniqueTraitIds.map((traitId) => ({
      id: crypto.randomUUID(),
      profileId,
      tmdbId,
      traitId,
      sentiment,
      createdAt: current
    }));
    state.ratingTraitReasons.push(...next);
    await this.write(state);
    return next;
  }

  async logExposure(
    tmdbId: number,
    source: MovieExposure["source"],
    sourceDetail?: string | null,
    profileId = DEFAULT_PROFILE_ID
  ) {
    const state = await this.read();
    const exposure: MovieExposure = {
      id: crypto.randomUUID(),
      profileId,
      tmdbId,
      source,
      sourceDetail,
      flipped: false,
      createdAt: now()
    };
    state.exposures.push(exposure);
    await this.write(state);
    return exposure;
  }

  async logExposures(
    entries: Array<{ tmdbId: number; source: MovieExposure["source"]; sourceDetail?: string | null }>,
    profileId = DEFAULT_PROFILE_ID
  ) {
    if (!entries.length) return;
    const state = await this.read();
    const current = now();
    for (const entry of entries) {
      state.exposures.push({
        id: crypto.randomUUID(),
        profileId,
        tmdbId: entry.tmdbId,
        source: entry.source,
        sourceDetail: entry.sourceDetail ?? null,
        flipped: false,
        createdAt: current
      });
    }
    await this.write(state);
  }

  async updateExposureBehavior(exposureId: string, behavior: ExposureBehavior, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    state.exposures = state.exposures.map((exposure) => {
      if (exposure.id !== exposureId || exposure.profileId !== profileId) return exposure;
      return {
        ...exposure,
        dwellMs: behavior.dwellMs !== undefined ? behavior.dwellMs : exposure.dwellMs,
        flipped: behavior.flipped !== undefined ? behavior.flipped : exposure.flipped,
        decisionMs: behavior.decisionMs !== undefined ? behavior.decisionMs : exposure.decisionMs
      };
    });
    await this.write(state);
  }

  async listExposures(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.exposures.filter((exposure) => exposure.profileId === profileId);
  }

  async deleteExposures(tmdbId: number, source: MovieExposure["source"], profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    state.exposures = state.exposures.filter(
      (exposure) => !(exposure.profileId === profileId && exposure.tmdbId === tmdbId && exposure.source === source)
    );
    await this.write(state);
  }

  async listMovieEmbeddings(tmdbIds?: number[]) {
    const state = await this.read();
    if (!tmdbIds?.length) return state.movieEmbeddings;
    const idSet = new Set(tmdbIds);
    return state.movieEmbeddings.filter((embedding) => idSet.has(embedding.tmdbId));
  }

  async upsertMovieEmbedding(embedding: MovieEmbedding) {
    const state = await this.read();
    const next = { ...embedding, updatedAt: embedding.updatedAt ?? now() };
    state.movieEmbeddings = [
      ...state.movieEmbeddings.filter((item) => item.tmdbId !== embedding.tmdbId),
      next
    ];
    await this.write(state);
  }

  async matchMovieEmbeddings(queryEmbedding: number[], matchCount: number, excludeTmdbIds: number[] = [], mediaType?: MediaType) {
    const state = await this.read();
    const excluded = new Set(excludeTmdbIds);
    return state.movieEmbeddings
      .filter(
        (embedding) =>
          embedding.embedding.length &&
          !excluded.has(embedding.tmdbId) &&
          (mediaType == null || mediaTypeOfId(embedding.tmdbId) === mediaType)
      )
      .map((embedding) => ({
        tmdbId: embedding.tmdbId,
        similarity: cosineSimilarity(queryEmbedding, embedding.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, matchCount);
  }

  async hideRecommendation(tmdbId: number) {
    const state = await this.read();
    state.hiddenRecommendations = Array.from(new Set([...state.hiddenRecommendations, tmdbId]));
    await this.write(state);
  }

  async listHiddenRecommendations() {
    const state = await this.read();
    return state.hiddenRecommendations;
  }

  async saveRecommendationRun(input: RecommendationRunInput, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    const runId = crypto.randomUUID();
    const createdAt = now();
    const items: RecommendationItem[] = input.items.map((item) => ({
      id: crypto.randomUUID(),
      runId,
      profileId,
      tmdbId: item.tmdbId,
      movie: item.movie,
      rank: item.rank,
      score: item.score,
      baselineScore: item.baselineScore,
      scoreBreakdown: item.scoreBreakdown,
      explanation: item.explanation,
      createdAt
    }));
    const run: RecommendationRun = {
      id: runId,
      profileId,
      promptVersion: input.promptVersion,
      scoringVersion: input.scoringVersion,
      status: input.status,
      baselineAverage: input.baselineAverage ?? null,
      recommendationAverage: input.recommendationAverage ?? null,
      metadata: input.metadata ?? {},
      createdAt,
      items
    };
    state.recommendationRuns.unshift(run);
    state.recommendationRuns = state.recommendationRuns.slice(0, 25);
    await this.write(state);
    return run;
  }

  async listRecommendationRuns(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.recommendationRuns.filter((run) => run.profileId === profileId);
  }

  async getLatestRecommendationRun(profileId = DEFAULT_PROFILE_ID) {
    // Runs are unshifted at save time, so the first match is the newest.
    const state = await this.read();
    return state.recommendationRuns.find((run) => run.profileId === profileId) ?? null;
  }

  async listWatchlist(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.watchlist.filter((item) => item.profileId === profileId);
  }

  async upsertWatchlistItem(tmdbId: number, status: WatchlistStatus, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    const existing = state.watchlist.find((item) => item.profileId === profileId && item.tmdbId === tmdbId);
    const current = now();
    const next: WatchlistItem = existing
      ? { ...existing, status, resolvedAt: status === "queued" ? null : current }
      : { profileId, tmdbId, status, addedAt: current, resolvedAt: status === "queued" ? null : current };
    state.watchlist = existing
      ? state.watchlist.map((item) => (item.profileId === profileId && item.tmdbId === tmdbId ? next : item))
      : [...state.watchlist, next];
    await this.write(state);
    return next;
  }

  async removeWatchlistItem(tmdbId: number, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    state.watchlist = state.watchlist.filter((item) => !(item.profileId === profileId && item.tmdbId === tmdbId));
    await this.write(state);
  }

  async getMovieEnrichment(tmdbId: number) {
    const state = await this.read();
    return state.movieEnrichments.find((item) => item.tmdbId === tmdbId) ?? null;
  }

  async listMovieEnrichments() {
    const state = await this.read();
    return state.movieEnrichments;
  }

  async saveMovieEnrichment(enrichment: MovieEnrichment) {
    const state = await this.read();
    state.movieEnrichments = [...state.movieEnrichments.filter((item) => item.tmdbId !== enrichment.tmdbId), enrichment];
    await this.write(state);
  }

  async listTaxonomyEmbeddings(version?: string) {
    const state = await this.read();
    return version ? state.taxonomyEmbeddings.filter((item) => item.version === version) : state.taxonomyEmbeddings;
  }

  async saveTaxonomyEmbeddings(embeddings: TaxonomyEmbedding[]) {
    if (!embeddings.length) return;
    const state = await this.read();
    const byId = new Map(state.taxonomyEmbeddings.map((item) => [item.traitId, item]));
    for (const embedding of embeddings) {
      byId.set(embedding.traitId, { ...embedding, updatedAt: embedding.updatedAt ?? now() });
    }
    state.taxonomyEmbeddings = Array.from(byId.values());
    await this.write(state);
  }

  async getProfile(profileId: string) {
    const state = await this.read();
    return state.profiles.find((profile) => profile.id === profileId) ?? null;
  }

  async updateProfileDisplayName(displayName: string, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    const existing = state.profiles.find((profile) => profile.id === profileId);
    const next: Profile = existing ? { ...existing, displayName } : { id: profileId, email: null, displayName };
    state.profiles = [...state.profiles.filter((profile) => profile.id !== profileId), next];
    await this.write(state);
    return next;
  }

  async createFriendInvite(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    const invite: FriendInvite = {
      token: crypto.randomUUID(),
      inviterProfileId: profileId,
      createdAt: now(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    state.friendInvites = [...state.friendInvites, invite];
    await this.write(state);
    return invite;
  }

  async getFriendInvite(token: string) {
    const state = await this.read();
    return state.friendInvites.find((invite) => invite.token === token) ?? null;
  }

  async listFriendInvites(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return state.friendInvites.filter((invite) => invite.inviterProfileId === profileId);
  }

  async deleteFriendInvite(token: string, profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    state.friendInvites = state.friendInvites.filter(
      (invite) => !(invite.token === token && invite.inviterProfileId === profileId)
    );
    await this.write(state);
  }

  async addFriendship(otherProfileId: string, invitedBy: string | null, profileId = DEFAULT_PROFILE_ID) {
    const [profileA, profileB] = canonicalPair(profileId, otherProfileId);
    const state = await this.read();
    if (state.friendships.some((row) => row.profileA === profileA && row.profileB === profileB)) return;
    state.friendships = [...state.friendships, { profileA, profileB, invitedBy, createdAt: now() }];
    await this.write(state);
  }

  async listFriends(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    const profileById = new Map(state.profiles.map((profile) => [profile.id, profile]));
    return state.friendships
      .filter((row) => row.profileA === profileId || row.profileB === profileId)
      .map((row) => {
        const friendId = row.profileA === profileId ? row.profileB : row.profileA;
        const profile = profileById.get(friendId);
        return {
          profileId: friendId,
          displayName: friendDisplayName(profile?.displayName, profile?.email),
          createdAt: row.createdAt
        };
      });
  }

  async removeFriendship(otherProfileId: string, profileId = DEFAULT_PROFILE_ID) {
    const [profileA, profileB] = canonicalPair(profileId, otherProfileId);
    const state = await this.read();
    state.friendships = state.friendships.filter((row) => !(row.profileA === profileA && row.profileB === profileB));
    await this.write(state);
  }

  async reset(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    state.ratings = state.ratings.filter((rating) => rating.profileId !== profileId);
    state.ratingReasons = state.ratingReasons.filter((reason) => reason.profileId !== profileId);
    state.ratingTraitReasons = state.ratingTraitReasons.filter((reason) => reason.profileId !== profileId);
    state.exposures = state.exposures.filter((exposure) => exposure.profileId !== profileId);
    state.comparisons = state.comparisons.filter((comparison) => comparison.profileId !== profileId);
    state.appealSignals = state.appealSignals.filter((signal) => signal.profileId !== profileId);
    state.watchlist = state.watchlist.filter((item) => item.profileId !== profileId);
    state.recommendationRuns = state.recommendationRuns.filter((run) => run.profileId !== profileId);
    state.hiddenRecommendations = [];
    await this.write(state);
  }

  async exportData(profileId = DEFAULT_PROFILE_ID) {
    const state = await this.read();
    return {
      movies: state.movies,
      ratings: state.ratings.filter((rating) => rating.profileId === profileId),
      ratingReasons: state.ratingReasons.filter((reason) => reason.profileId === profileId),
      ratingTraitReasons: state.ratingTraitReasons.filter((reason) => reason.profileId === profileId),
      exposures: state.exposures.filter((exposure) => exposure.profileId === profileId),
      comparisons: state.comparisons.filter((comparison) => comparison.profileId === profileId),
      appealSignals: state.appealSignals.filter((signal) => signal.profileId === profileId),
      watchlist: state.watchlist.filter((item) => item.profileId === profileId),
      recommendationRuns: state.recommendationRuns.filter((run) => run.profileId === profileId),
      hiddenRecommendations: state.hiddenRecommendations
    };
  }
}

export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function storeMode() {
  return supabaseConfigured() ? "supabase" : "local-json";
}

function supabaseClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
  });
}

function dbMovieToMovie(row: Record<string, unknown>, credits?: Movie["credits"], facts?: TasteFact[]): Movie {
  const sourcePayload = row.source_payload as Record<string, unknown> | null | undefined;
  const originalLanguage =
    typeof row.original_language === "string"
      ? row.original_language
      : typeof sourcePayload?.original_language === "string"
        ? sourcePayload.original_language
        : null;
  const movie: Movie = {
    tmdbId: Number(row.tmdb_id),
    mediaType: (row.media_type as MediaType | null) ?? "movie",
    title: String(row.title),
    originalTitle: (row.original_title as string | null) ?? null,
    originalLanguage,
    overview: String(row.overview ?? ""),
    posterPath: (row.poster_path as string | null) ?? null,
    backdropPath: (row.backdrop_path as string | null) ?? null,
    releaseDate: (row.release_date as string | null) ?? null,
    runtime: row.runtime == null ? null : Number(row.runtime),
    voteAverage: Number(row.vote_average ?? 0),
    voteCount: Number(row.vote_count ?? 0),
    popularity: Number(row.popularity ?? 0),
    adult: Boolean(row.adult),
    genres: (row.genres as Movie["genres"]) ?? [],
    keywords: (row.keywords as string[]) ?? [],
    countries: (row.countries as string[]) ?? [],
    credits: credits ?? null,
    tasteFacts: facts ?? [],
    sourcePayload: sourcePayload ? { original_language: originalLanguage } : undefined,
    updatedAt: (row.updated_at as string | undefined) ?? undefined
  };
  return withFacts(movie);
}

function dbFactToTasteFact(row: Record<string, unknown>): TasteFact {
  return {
    tmdbId: Number(row.tmdb_id),
    kind: row.kind as TasteFact["kind"],
    value: String(row.value),
    weight: Number(row.weight ?? 1),
    source: row.source as TasteFact["source"]
  };
}

function dbInviteToInvite(row: Record<string, unknown>): FriendInvite {
  return {
    token: String(row.token),
    inviterProfileId: String(row.inviter_profile_id),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at)
  };
}

function dbRatingToRating(row: Record<string, unknown>): Rating {
  return {
    profileId: String(row.profile_id),
    tmdbId: Number(row.tmdb_id),
    rating: row.rating as RatingValue,
    verdict: (row.verdict as Verdict | null) ?? null,
    rankScore: row.rank_score == null ? null : Number(row.rank_score),
    mediaType: (row.media_type as Rating["mediaType"]) ?? "movie",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function dbComparisonToComparison(row: Record<string, unknown>): Comparison {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    winnerTmdbId: Number(row.winner_tmdb_id),
    loserTmdbId: Number(row.loser_tmdb_id),
    createdAt: String(row.created_at)
  };
}

function dbAppealSignalToAppealSignal(row: Record<string, unknown>): AppealSignal {
  return {
    profileId: String(row.profile_id),
    tmdbId: Number(row.tmdb_id),
    signal: row.signal as AppealSignalValue,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function dbExposureToMovieExposure(row: Record<string, unknown>): MovieExposure {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    tmdbId: Number(row.tmdb_id),
    source: row.source as MovieExposure["source"],
    sourceDetail: (row.source_detail as string | null) ?? null,
    dwellMs: row.dwell_ms == null ? null : Number(row.dwell_ms),
    flipped: Boolean(row.flipped),
    decisionMs: row.decision_ms == null ? null : Number(row.decision_ms),
    createdAt: String(row.created_at)
  };
}

function dbRatingReasonToRatingReason(row: Record<string, unknown>): RatingReason {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    tmdbId: Number(row.tmdb_id),
    reason: row.reason as RatingReasonValue,
    sentiment: row.sentiment as RatingReasonSentiment,
    createdAt: String(row.created_at)
  };
}

function dbRatingTraitReasonToRatingTraitReason(row: Record<string, unknown>): RatingTraitReason {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    tmdbId: Number(row.tmdb_id),
    traitId: String(row.trait_id),
    sentiment: row.sentiment as RatingReasonSentiment,
    createdAt: String(row.created_at)
  };
}

function parseEmbedding(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== "string") return [];

  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function dbEmbeddingToMovieEmbedding(row: Record<string, unknown>): MovieEmbedding {
  return {
    tmdbId: Number(row.tmdb_id),
    model: String(row.model),
    featureText: String(row.feature_text ?? ""),
    embedding: parseEmbedding(row.embedding),
    updatedAt: (row.updated_at as string | undefined) ?? undefined
  };
}

function dbWatchlistToWatchlistItem(row: Record<string, unknown>): WatchlistItem {
  return {
    profileId: String(row.profile_id),
    tmdbId: Number(row.tmdb_id),
    status: row.status as WatchlistStatus,
    addedAt: String(row.added_at),
    resolvedAt: (row.resolved_at as string | null) ?? null
  };
}

function dbEnrichmentToMovieEnrichment(row: Record<string, unknown>): MovieEnrichment {
  return {
    tmdbId: Number(row.tmdb_id),
    version: String(row.version),
    essence: (row.essence as string | null) ?? null,
    traitCount: Number(row.trait_count ?? 0),
    enrichedAt: String(row.enriched_at)
  };
}

const MOVIE_SELECT_COLUMNS = [
  "tmdb_id",
  "media_type",
  "title",
  "original_title",
  "original_language",
  "overview",
  "poster_path",
  "backdrop_path",
  "release_date",
  "runtime",
  "vote_average",
  "vote_count",
  "popularity",
  "adult",
  "genres",
  "keywords",
  "countries",
  "updated_at"
].join(",");

class SupabaseMovieStore implements MovieStore {
  private moviesCache: { movies: Movie[]; expiresAt: number } | null = null;
  private moviesInFlight: Promise<Movie[]> | null = null;

  constructor(private db: SupabaseClient) {}

  private async ensureProfile(profileId: string) {
    // Never mint a profile row for the anonymous read-only sentinel; an
    // accidental anonymous write should fail on the FK, not create a profile.
    if (profileId === ANONYMOUS_PROFILE_ID) return;
    await this.db.from("profiles").upsert({ id: profileId }, { onConflict: "id" });
  }

  // PostgREST caps responses at 1000 rows; every unbounded list must page through
  // with .range() or newer rows silently disappear once a table crosses the cap.
  private async fetchAllRows(
    buildPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
  ): Promise<Record<string, unknown>[]> {
    const pageSize = 1000;
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildPage(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  }

  async listMovies(mediaType?: MediaType) {
    const all = await this.listAllMovies();
    if (!mediaType) return all;
    return all.filter((movie) => (movie.mediaType ?? "movie") === mediaType);
  }

  private async listAllMovies() {
    if (this.moviesCache && this.moviesCache.expiresAt > Date.now()) {
      return this.moviesCache.movies;
    }
    // In-flight dedup: concurrent cold requests share one catalog fetch
    // instead of each paying the full paginated scan.
    if (this.moviesInFlight) return this.moviesInFlight;
    this.moviesInFlight = this.fetchAllMovies().finally(() => {
      this.moviesInFlight = null;
    });
    return this.moviesInFlight;
  }

  private async fetchAllMovies() {
    const pageSize = 1000;
    const rows: Record<string, unknown>[] = [];

    for (let from = 0; from < MAX_CATALOG_ROWS; from += pageSize) {
      const to = Math.min(from + pageSize - 1, MAX_CATALOG_ROWS - 1);
      const { data, error } = await this.db
        .from("movies")
        .select(MOVIE_SELECT_COLUMNS)
        .order("popularity", { ascending: false })
        .range(from, to);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
      if (!data || data.length < pageSize) break;
    }

    let factsByMovie = new Map<number, TasteFact[]>();
    if (rows.length) {
      const ids = rows.map((row) => Number(row.tmdb_id));
      const factRows: Record<string, unknown>[] = [];
      for (const chunk of chunkArray(ids, 1000)) {
        const { data, error } = await this.db.from("movie_taste_facts").select("*").in("tmdb_id", chunk);
        if (!error) factRows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
      }
      factsByMovie = factRows.reduce((map, row) => {
        const fact = dbFactToTasteFact(row);
        const bucket = map.get(fact.tmdbId) ?? [];
        bucket.push(fact);
        map.set(fact.tmdbId, bucket);
        return map;
      }, new Map<number, TasteFact[]>());
    }

    const movies = rows.map((row) => dbMovieToMovie(row, undefined, factsByMovie.get(Number(row.tmdb_id))));
    const result = movies.length ? movies : FALLBACK_MOVIES.map(withFacts);
    this.moviesCache = { movies: result, expiresAt: Date.now() + 5 * 60 * 1000 };
    return result;
  }

  async getMovie(tmdbId: number) {
    const { data, error } = await this.db.from("movies").select(MOVIE_SELECT_COLUMNS).eq("tmdb_id", tmdbId).maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const [{ data: credits }, { data: facts }] = await Promise.all([
      this.db.from("movie_credits").select("*").eq("tmdb_id", tmdbId).maybeSingle(),
      this.db.from("movie_taste_facts").select("*").eq("tmdb_id", tmdbId)
    ]);

    return dbMovieToMovie(
      data as unknown as Record<string, unknown>,
      credits
        ? {
            tmdbId,
            director: (credits.director as string | null) ?? null,
            actors: (credits.actors as string[]) ?? [],
            crew: (credits.crew as string[]) ?? [],
            updatedAt: credits.updated_at as string
          }
        : null,
      (facts ?? []).map((fact) => ({
        tmdbId,
        kind: fact.kind,
        value: fact.value,
        weight: Number(fact.weight),
        source: fact.source
      }))
    );
  }

  async getMoviesByIds(tmdbIds: number[]) {
    if (!tmdbIds.length) return [];
    // Warm cache: answer from memory rather than re-querying.
    if (this.moviesCache && this.moviesCache.expiresAt > Date.now()) {
      const wanted = new Set(tmdbIds);
      return this.moviesCache.movies.filter((movie) => wanted.has(movie.tmdbId));
    }

    const ids = Array.from(new Set(tmdbIds));
    const rows: Record<string, unknown>[] = [];
    for (const chunk of chunkArray(ids, 500)) {
      const { data, error } = await this.db.from("movies").select(MOVIE_SELECT_COLUMNS).in("tmdb_id", chunk);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    }

    const factRows: Record<string, unknown>[] = [];
    for (const chunk of chunkArray(ids, 1000)) {
      const { data, error } = await this.db.from("movie_taste_facts").select("*").in("tmdb_id", chunk);
      if (!error) factRows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    }
    const factsByMovie = factRows.reduce((map, row) => {
      const fact = dbFactToTasteFact(row);
      const bucket = map.get(fact.tmdbId) ?? [];
      bucket.push(fact);
      map.set(fact.tmdbId, bucket);
      return map;
    }, new Map<number, TasteFact[]>());

    return rows.map((row) => dbMovieToMovie(row, undefined, factsByMovie.get(Number(row.tmdb_id))));
  }

  async listMovieCredits(tmdbIds: number[]) {
    if (!tmdbIds.length) return [];
    const rows: Record<string, unknown>[] = [];
    for (const chunk of chunkArray(tmdbIds, 500)) {
      const { data, error } = await this.db.from("movie_credits").select("tmdb_id,director,actors").in("tmdb_id", chunk);
      if (error) {
        console.warn("Movie credits unavailable", error.message);
        return [];
      }
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    }
    return rows.map((row) => ({
      tmdbId: Number(row.tmdb_id),
      director: (row.director as string | null) ?? null,
      actors: (row.actors as string[]) ?? []
    }));
  }

  async upsertMovies(movies: Movie[]) {
    if (!movies.length) return;
    this.moviesCache = null;
    const enriched = movies.map(withFacts);
    const currentTime = now();
    const movieRows = enriched.map((movie) => ({
        tmdb_id: movie.tmdbId,
        media_type: movie.mediaType ?? mediaTypeOfId(movie.tmdbId),
        source_id: sourceIdOf(movie.tmdbId),
        title: movie.title,
        original_title: movie.originalTitle ?? null,
        original_language: movie.originalLanguage ?? "en",
        overview: movie.overview,
        poster_path: movie.posterPath,
        backdrop_path: movie.backdropPath ?? null,
        release_date: movie.releaseDate ?? null,
        runtime: movie.runtime ?? null,
        vote_average: movie.voteAverage,
        vote_count: movie.voteCount,
        popularity: movie.popularity,
        adult: movie.adult,
        genres: movie.genres,
        keywords: movie.keywords,
        countries: movie.countries,
        source_payload: movie.sourcePayload ?? {},
        updated_at: currentTime
      }));

    for (const chunk of chunkArray(movieRows, 500)) {
      const { error } = await this.db.from("movies").upsert(chunk, { onConflict: "tmdb_id" });
      if (error) throw error;
    }

    const credits = enriched
      .filter((movie) => movie.credits)
      .map((movie) => ({
        tmdb_id: movie.tmdbId,
        director: movie.credits?.director ?? null,
        actors: movie.credits?.actors ?? [],
        crew: movie.credits?.crew ?? [],
        updated_at: currentTime
      }));
    if (credits.length) {
      for (const chunk of chunkArray(credits, 500)) {
        const { error: creditsError } = await this.db.from("movie_credits").upsert(chunk, { onConflict: "tmdb_id" });
        if (creditsError) throw creditsError;
      }
    }

    const facts = enriched.flatMap((movie) =>
      (movie.tasteFacts ?? []).map((fact) => ({
        tmdb_id: movie.tmdbId,
        kind: fact.kind,
        value: fact.value,
        weight: fact.weight,
        source: fact.source
      }))
    );
    if (facts.length) {
      for (const chunk of chunkArray(facts, 1000)) {
        const { error: factsError } = await this.db.from("movie_taste_facts").upsert(chunk, {
          onConflict: "tmdb_id,kind,value"
        });
        if (factsError) throw factsError;
      }
    }
  }

  async replaceTasteFactsForSource(source: TasteFact["source"], facts: TasteFact[]) {
    const { error: deleteError } = await this.db.from("movie_taste_facts").delete().eq("source", source);
    if (deleteError) throw deleteError;
    if (!facts.length) {
      this.moviesCache = null;
      return;
    }

    const rows = facts.map((fact) => ({
      tmdb_id: fact.tmdbId,
      kind: fact.kind,
      value: fact.value,
      weight: fact.weight,
      source: fact.source
    }));
    for (const chunk of chunkArray(rows, 1000)) {
      const { error } = await this.db.from("movie_taste_facts").upsert(chunk, { onConflict: "tmdb_id,kind,value" });
      if (error) throw error;
    }
    this.moviesCache = null;
  }

  async replaceTasteFactsForMovie(tmdbId: number, source: TasteFact["source"], facts: TasteFact[]) {
    const { error: deleteError } = await this.db.from("movie_taste_facts").delete().eq("tmdb_id", tmdbId).eq("source", source);
    if (deleteError) throw deleteError;
    if (facts.length) {
      const rows = facts.map((fact) => ({
        tmdb_id: fact.tmdbId,
        kind: fact.kind,
        value: fact.value,
        weight: fact.weight,
        source: fact.source
      }));
      const { error } = await this.db.from("movie_taste_facts").upsert(rows, { onConflict: "tmdb_id,kind,value" });
      if (error) throw error;
    }
    this.moviesCache = null;
  }

  async listRatings(profileId = DEFAULT_PROFILE_ID) {
    const rows = await this.fetchAllRows((from, to) =>
      this.db.from("ratings").select("*").eq("profile_id", profileId).order("updated_at").order("tmdb_id").range(from, to)
    );
    return rows.map(dbRatingToRating);
  }

  async upsertRating(tmdbId: number, rating: RatingValue, profileId = DEFAULT_PROFILE_ID, options?: RatingUpsertOptions) {
    await this.ensureProfile(profileId);
    const payload: Record<string, unknown> = {
      profile_id: profileId,
      tmdb_id: tmdbId,
      rating,
      media_type: mediaTypeOfId(tmdbId),
      updated_at: now()
    };
    if (options?.verdict !== undefined) payload.verdict = options.verdict;
    if (options?.rankScore !== undefined) payload.rank_score = options.rankScore;
    const { data, error } = await this.db.from("ratings").upsert(payload, { onConflict: "profile_id,tmdb_id" }).select("*").single();
    if (error) throw error;
    return dbRatingToRating(data as unknown as Record<string, unknown>);
  }

  async updateRatingRanks(updates: RatingRankUpdate[], profileId = DEFAULT_PROFILE_ID) {
    if (!updates.length) return;
    const current = now();
    for (const chunk of chunkArray(updates, 25)) {
      const results = await Promise.all(
        chunk.map((update) =>
          this.db
            .from("ratings")
            .update({ verdict: update.verdict, rank_score: update.rankScore, updated_at: current })
            .eq("profile_id", profileId)
            .eq("tmdb_id", update.tmdbId)
        )
      );
      for (const { error } of results) {
        if (error) throw error;
      }
    }
  }

  async deleteRating(tmdbId: number, profileId = DEFAULT_PROFILE_ID) {
    await this.db.from("rating_reasons").delete().eq("profile_id", profileId).eq("tmdb_id", tmdbId);
    await this.db.from("rating_trait_reasons").delete().eq("profile_id", profileId).eq("tmdb_id", tmdbId);
    await this.db
      .from("comparisons")
      .delete()
      .eq("profile_id", profileId)
      .or(`winner_tmdb_id.eq.${tmdbId},loser_tmdb_id.eq.${tmdbId}`);
    const { error } = await this.db.from("ratings").delete().eq("profile_id", profileId).eq("tmdb_id", tmdbId);
    if (error) throw error;
  }

  async listComparisons(profileId = DEFAULT_PROFILE_ID) {
    try {
      const rows = await this.fetchAllRows((from, to) =>
        this.db.from("comparisons").select("*").eq("profile_id", profileId).order("created_at").order("id").range(from, to)
      );
      return rows.map(dbComparisonToComparison);
    } catch (error) {
      console.warn("Comparisons unavailable", error instanceof Error ? error.message : error);
      return [];
    }
  }

  async addComparison(winnerTmdbId: number, loserTmdbId: number, profileId = DEFAULT_PROFILE_ID) {
    await this.ensureProfile(profileId);
    const { data, error } = await this.db
      .from("comparisons")
      .insert({ profile_id: profileId, winner_tmdb_id: winnerTmdbId, loser_tmdb_id: loserTmdbId })
      .select("*")
      .single();
    if (error) throw error;
    return dbComparisonToComparison(data as unknown as Record<string, unknown>);
  }

  async listAppealSignals(profileId = DEFAULT_PROFILE_ID) {
    try {
      const rows = await this.fetchAllRows((from, to) =>
        this.db.from("appeal_signals").select("*").eq("profile_id", profileId).order("created_at").order("tmdb_id").range(from, to)
      );
      return rows.map(dbAppealSignalToAppealSignal);
    } catch (error) {
      console.warn("Appeal signals unavailable", error instanceof Error ? error.message : error);
      return [];
    }
  }

  async upsertAppealSignal(tmdbId: number, signal: AppealSignalValue, profileId = DEFAULT_PROFILE_ID) {
    await this.ensureProfile(profileId);
    const { data, error } = await this.db
      .from("appeal_signals")
      .upsert({ profile_id: profileId, tmdb_id: tmdbId, signal, updated_at: now() }, { onConflict: "profile_id,tmdb_id" })
      .select("*")
      .single();
    if (error) throw error;
    return dbAppealSignalToAppealSignal(data as unknown as Record<string, unknown>);
  }

  async deleteAppealSignal(tmdbId: number, profileId = DEFAULT_PROFILE_ID) {
    const { error } = await this.db.from("appeal_signals").delete().eq("profile_id", profileId).eq("tmdb_id", tmdbId);
    if (error) throw error;
  }

  async listRatingReasons(profileId = DEFAULT_PROFILE_ID) {
    try {
      const rows = await this.fetchAllRows((from, to) =>
        this.db.from("rating_reasons").select("*").eq("profile_id", profileId).order("created_at").order("id").range(from, to)
      );
      return rows.map(dbRatingReasonToRatingReason);
    } catch (error) {
      console.warn("Rating reasons unavailable", error instanceof Error ? error.message : error);
      return [];
    }
  }

  async listRatingTraitReasons(profileId = DEFAULT_PROFILE_ID) {
    try {
      const rows = await this.fetchAllRows((from, to) =>
        this.db.from("rating_trait_reasons").select("*").eq("profile_id", profileId).order("created_at").order("id").range(from, to)
      );
      return rows.map(dbRatingTraitReasonToRatingTraitReason);
    } catch (error) {
      console.warn("Rating trait reasons unavailable", error instanceof Error ? error.message : error);
      return [];
    }
  }

  async saveRatingReasons(
    tmdbId: number,
    reasons: RatingReasonValue[],
    sentiment: RatingReasonSentiment,
    profileId = DEFAULT_PROFILE_ID
  ) {
    await this.ensureProfile(profileId);
    const uniqueReasons = Array.from(new Set(reasons));
    const { error: deleteError } = await this.db
      .from("rating_reasons")
      .delete()
      .eq("profile_id", profileId)
      .eq("tmdb_id", tmdbId)
      .eq("sentiment", sentiment);
    if (deleteError) {
      console.warn("Rating reasons unavailable", deleteError.message);
      return [];
    }
    if (!uniqueReasons.length) return [];

    const rows = uniqueReasons.map((reason) => ({
      profile_id: profileId,
      tmdb_id: tmdbId,
      reason,
      sentiment
    }));
    const { data, error } = await this.db.from("rating_reasons").insert(rows).select("*");
    if (error) {
      console.warn("Rating reasons unavailable", error.message);
      return [];
    }
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(dbRatingReasonToRatingReason);
  }

  async saveRatingTraitReasons(
    tmdbId: number,
    traitIds: string[],
    sentiment: RatingReasonSentiment,
    profileId = DEFAULT_PROFILE_ID
  ) {
    await this.ensureProfile(profileId);
    const uniqueTraitIds = Array.from(new Set(traitIds));
    const { error: deleteError } = await this.db
      .from("rating_trait_reasons")
      .delete()
      .eq("profile_id", profileId)
      .eq("tmdb_id", tmdbId)
      .eq("sentiment", sentiment);
    if (deleteError) {
      console.warn("Rating trait reasons unavailable", deleteError.message);
      return [];
    }
    if (!uniqueTraitIds.length) return [];

    const rows = uniqueTraitIds.map((traitId) => ({
      profile_id: profileId,
      tmdb_id: tmdbId,
      trait_id: traitId,
      sentiment
    }));
    const { data, error } = await this.db.from("rating_trait_reasons").insert(rows).select("*");
    if (error) {
      console.warn("Rating trait reasons unavailable", error.message);
      return [];
    }
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(dbRatingTraitReasonToRatingTraitReason);
  }

  async logExposure(
    tmdbId: number,
    source: MovieExposure["source"],
    sourceDetail?: string | null,
    profileId = DEFAULT_PROFILE_ID
  ) {
    await this.ensureProfile(profileId);
    const { data, error } = await this.db
      .from("movie_exposures")
      .insert({ profile_id: profileId, tmdb_id: tmdbId, source, source_detail: sourceDetail ?? null })
      .select("*")
      .single();
    if (error) throw error;
    return dbExposureToMovieExposure(data as unknown as Record<string, unknown>);
  }

  async logExposures(
    entries: Array<{ tmdbId: number; source: MovieExposure["source"]; sourceDetail?: string | null }>,
    profileId = DEFAULT_PROFILE_ID
  ) {
    if (!entries.length) return;
    await this.ensureProfile(profileId);
    const { error } = await this.db.from("movie_exposures").insert(
      entries.map((entry) => ({
        profile_id: profileId,
        tmdb_id: entry.tmdbId,
        source: entry.source,
        source_detail: entry.sourceDetail ?? null
      }))
    );
    if (error) throw error;
  }

  async updateExposureBehavior(exposureId: string, behavior: ExposureBehavior, profileId = DEFAULT_PROFILE_ID) {
    const payload: Record<string, unknown> = {};
    if (behavior.dwellMs !== undefined) payload.dwell_ms = behavior.dwellMs;
    if (behavior.flipped !== undefined) payload.flipped = behavior.flipped;
    if (behavior.decisionMs !== undefined) payload.decision_ms = behavior.decisionMs;
    if (!Object.keys(payload).length) return;
    const { error } = await this.db.from("movie_exposures").update(payload).eq("id", exposureId).eq("profile_id", profileId);
    if (error) console.warn("Exposure behavior update unavailable", error.message);
  }

  async listExposures(profileId = DEFAULT_PROFILE_ID) {
    const rows = await this.fetchAllRows((from, to) =>
      this.db.from("movie_exposures").select("*").eq("profile_id", profileId).order("created_at").order("id").range(from, to)
    );
    return rows.map(dbExposureToMovieExposure);
  }

  async deleteExposures(tmdbId: number, source: MovieExposure["source"], profileId = DEFAULT_PROFILE_ID) {
    const { error } = await this.db
      .from("movie_exposures")
      .delete()
      .eq("profile_id", profileId)
      .eq("tmdb_id", tmdbId)
      .eq("source", source);
    if (error) throw error;
  }

  async listMovieEmbeddings(tmdbIds?: number[]) {
    const select = "tmdb_id,model,feature_text,embedding,updated_at";
    const rows: Record<string, unknown>[] = [];

    if (tmdbIds?.length) {
      for (const chunk of chunkArray(tmdbIds, 500)) {
        const { data, error } = await this.db.from("movie_embeddings").select(select).in("tmdb_id", chunk);
        if (error) throw error;
        rows.push(...((data ?? []) as Record<string, unknown>[]));
      }
      return rows.map(dbEmbeddingToMovieEmbedding);
    }

    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.db
        .from("movie_embeddings")
        .select(select)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < pageSize) break;
    }

    return rows.map(dbEmbeddingToMovieEmbedding);
  }

  async upsertMovieEmbedding(embedding: MovieEmbedding) {
    const { error } = await this.db.from("movie_embeddings").upsert(
      {
        tmdb_id: embedding.tmdbId,
        model: embedding.model,
        feature_text: embedding.featureText,
        embedding: embedding.embedding,
        updated_at: embedding.updatedAt ?? now()
      },
      { onConflict: "tmdb_id" }
    );
    if (error) throw error;
  }

  async matchMovieEmbeddings(queryEmbedding: number[], matchCount: number, excludeTmdbIds: number[] = [], mediaType?: MediaType) {
    const { data, error } = await this.db.rpc("match_movie_embeddings", {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      exclude_tmdb_ids: excludeTmdbIds,
      media: mediaType ?? null
    });
    if (error) {
      console.warn("Embedding match unavailable, falling back to trait-only recommendations", error.message);
      return [];
    }

    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      tmdbId: Number(row.tmdb_id),
      similarity: Number(row.similarity ?? 0)
    }));
  }

  async hideRecommendation(tmdbId: number, reason?: string | null, profileId = DEFAULT_PROFILE_ID) {
    await this.ensureProfile(profileId);
    const { error } = await this.db
      .from("hidden_recommendations")
      .upsert({ profile_id: profileId, tmdb_id: tmdbId, reason: reason ?? null }, { onConflict: "profile_id,tmdb_id" });
    if (error) throw error;
  }

  async listHiddenRecommendations(profileId = DEFAULT_PROFILE_ID) {
    const rows = await this.fetchAllRows((from, to) =>
      this.db.from("hidden_recommendations").select("tmdb_id").eq("profile_id", profileId).order("tmdb_id").range(from, to)
    );
    return rows.map((row) => row.tmdb_id as number);
  }

  async saveRecommendationRun(input: RecommendationRunInput, profileId = DEFAULT_PROFILE_ID) {
    await this.ensureProfile(profileId);
    const { data: run, error } = await this.db
      .from("recommendation_runs")
      .insert({
        profile_id: profileId,
        prompt_version: input.promptVersion,
        scoring_version: input.scoringVersion,
        status: input.status,
        baseline_average: input.baselineAverage ?? null,
        recommendation_average: input.recommendationAverage ?? null,
        metadata: input.metadata ?? {}
      })
      .select("*")
      .single();
    if (error) throw error;

    const itemRows = input.items.map((item) => ({
      run_id: run.id,
      profile_id: profileId,
      tmdb_id: item.tmdbId,
      rank: item.rank,
      score: item.score,
      baseline_score: item.baselineScore,
      score_breakdown: item.scoreBreakdown,
      explanation: item.explanation
    }));
    const { data: items, error: itemsError } = await this.db.from("recommendation_items").insert(itemRows).select("*");
    if (itemsError) throw itemsError;

    return {
      id: run.id,
      profileId,
      promptVersion: run.prompt_version,
      scoringVersion: run.scoring_version,
      status: run.status,
      baselineAverage: run.baseline_average,
      recommendationAverage: run.recommendation_average,
      metadata: run.metadata ?? {},
      createdAt: run.created_at,
      items: (items ?? []).map((item, index) => ({
        id: item.id,
        runId: run.id,
        profileId,
        tmdbId: item.tmdb_id,
        movie: input.items[index].movie,
        rank: item.rank,
        score: Number(item.score),
        baselineScore: Number(item.baseline_score),
        scoreBreakdown: item.score_breakdown,
        explanation: item.explanation,
        createdAt: item.created_at
      }))
    };
  }

  async listRecommendationRuns(profileId = DEFAULT_PROFILE_ID) {
    const { data: runs, error } = await this.db
      .from("recommendation_runs")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    const movies = await this.listMovies();
    const movieById = new Map(movies.map((movie) => [movie.tmdbId, movie]));

    return Promise.all(
      (runs ?? []).map(async (run) => {
        const { data: items, error: itemError } = await this.db
          .from("recommendation_items")
          .select("*")
          .eq("run_id", run.id)
          .order("rank");
        if (itemError) throw itemError;
        return {
          id: run.id,
          profileId,
          promptVersion: run.prompt_version,
          scoringVersion: run.scoring_version,
          status: run.status,
          baselineAverage: run.baseline_average,
          recommendationAverage: run.recommendation_average,
          metadata: run.metadata ?? {},
          createdAt: run.created_at,
          items: (items ?? []).flatMap((item) => {
            const movie = movieById.get(item.tmdb_id);
            if (!movie) return [];
            return [
              {
                id: item.id,
                runId: run.id,
                profileId,
                tmdbId: item.tmdb_id,
                movie,
                rank: item.rank,
                score: Number(item.score),
                baselineScore: Number(item.baseline_score),
                scoreBreakdown: item.score_breakdown,
                explanation: item.explanation,
                createdAt: item.created_at
              }
            ];
          })
        };
      })
    );
  }

  async getLatestRecommendationRun(profileId = DEFAULT_PROFILE_ID) {
    const { data: run, error } = await this.db
      .from("recommendation_runs")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!run) return null;

    const { data: items, error: itemError } = await this.db
      .from("recommendation_items")
      .select("*")
      .eq("run_id", run.id)
      .order("rank");
    if (itemError) throw itemError;

    // Hydrate only the run's own movies - never the full catalog.
    const itemRows = (items ?? []) as Record<string, unknown>[];
    const movies = await this.getMoviesByIds(itemRows.map((item) => Number(item.tmdb_id)));
    const movieById = new Map(movies.map((movie) => [movie.tmdbId, movie]));

    return {
      id: String(run.id),
      profileId,
      promptVersion: run.prompt_version,
      scoringVersion: run.scoring_version,
      status: run.status,
      baselineAverage: run.baseline_average,
      recommendationAverage: run.recommendation_average,
      metadata: run.metadata ?? {},
      createdAt: run.created_at,
      items: itemRows.flatMap((item) => {
        const movie = movieById.get(Number(item.tmdb_id));
        if (!movie) return [];
        return [
          {
            id: String(item.id),
            runId: String(run.id),
            profileId,
            tmdbId: Number(item.tmdb_id),
            movie,
            rank: Number(item.rank),
            score: Number(item.score),
            baselineScore: Number(item.baseline_score),
            scoreBreakdown: item.score_breakdown as RecommendationScoreBreakdown,
            explanation: (item.explanation as string | null) ?? undefined,
            createdAt: String(item.created_at)
          }
        ];
      })
    } as RecommendationRun;
  }

  async getProfile(profileId: string) {
    const { data, error } = await this.db
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: String(data.id), email: (data.email as string | null) ?? null, displayName: (data.display_name as string | null) ?? null };
  }

  async updateProfileDisplayName(displayName: string, profileId = DEFAULT_PROFILE_ID) {
    const { data, error } = await this.db
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", profileId)
      .select("id, email, display_name")
      .single();
    if (error) throw error;
    return { id: String(data.id), email: (data.email as string | null) ?? null, displayName: (data.display_name as string | null) ?? null };
  }

  async createFriendInvite(profileId = DEFAULT_PROFILE_ID) {
    const { data, error } = await this.db
      .from("friend_invites")
      .insert({ inviter_profile_id: profileId })
      .select("*")
      .single();
    if (error) throw error;
    return dbInviteToInvite(data as Record<string, unknown>);
  }

  async getFriendInvite(token: string) {
    const { data, error } = await this.db.from("friend_invites").select("*").eq("token", token).maybeSingle();
    if (error) throw error;
    return data ? dbInviteToInvite(data as Record<string, unknown>) : null;
  }

  async listFriendInvites(profileId = DEFAULT_PROFILE_ID) {
    const { data, error } = await this.db
      .from("friend_invites")
      .select("*")
      .eq("inviter_profile_id", profileId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(dbInviteToInvite);
  }

  async deleteFriendInvite(token: string, profileId = DEFAULT_PROFILE_ID) {
    const { error } = await this.db.from("friend_invites").delete().eq("token", token).eq("inviter_profile_id", profileId);
    if (error) throw error;
  }

  async addFriendship(otherProfileId: string, invitedBy: string | null, profileId = DEFAULT_PROFILE_ID) {
    const [profileA, profileB] = canonicalPair(profileId, otherProfileId);
    const { error } = await this.db
      .from("friendships")
      .upsert({ profile_a: profileA, profile_b: profileB, invited_by: invitedBy }, { onConflict: "profile_a,profile_b", ignoreDuplicates: true });
    if (error) throw error;
  }

  async listFriends(profileId = DEFAULT_PROFILE_ID) {
    const { data, error } = await this.db
      .from("friendships")
      .select("profile_a, profile_b, created_at")
      .or(`profile_a.eq.${profileId},profile_b.eq.${profileId}`);
    if (error) throw error;
    const rows = (data ?? []) as { profile_a: string; profile_b: string; created_at: string }[];
    const friendIds = rows.map((row) => (row.profile_a === profileId ? row.profile_b : row.profile_a));
    if (!friendIds.length) return [];
    const { data: profiles, error: profileError } = await this.db
      .from("profiles")
      .select("id, display_name, email")
      .in("id", friendIds);
    if (profileError) throw profileError;
    const nameById = new Map(
      (profiles ?? []).map((profile) => [
        profile.id as string,
        friendDisplayName((profile.display_name as string | null) ?? null, (profile.email as string | null) ?? null)
      ])
    );
    return rows.map((row) => {
      const friendId = row.profile_a === profileId ? row.profile_b : row.profile_a;
      return { profileId: friendId, displayName: nameById.get(friendId) ?? null, createdAt: row.created_at };
    });
  }

  async removeFriendship(otherProfileId: string, profileId = DEFAULT_PROFILE_ID) {
    const [profileA, profileB] = canonicalPair(profileId, otherProfileId);
    const { error } = await this.db.from("friendships").delete().eq("profile_a", profileA).eq("profile_b", profileB);
    if (error) throw error;
  }

  async reset(profileId = DEFAULT_PROFILE_ID) {
    await Promise.all([
      this.db.from("hidden_recommendations").delete().eq("profile_id", profileId),
      this.db.from("rating_reasons").delete().eq("profile_id", profileId),
      this.db.from("rating_trait_reasons").delete().eq("profile_id", profileId),
      this.db.from("comparisons").delete().eq("profile_id", profileId),
      this.db.from("appeal_signals").delete().eq("profile_id", profileId),
      this.db.from("watchlist_items").delete().eq("profile_id", profileId),
      this.db.from("ratings").delete().eq("profile_id", profileId),
      this.db.from("movie_exposures").delete().eq("profile_id", profileId)
    ]);
    const { data: runs } = await this.db.from("recommendation_runs").select("id").eq("profile_id", profileId);
    const runIds = (runs ?? []).map((run) => run.id);
    if (runIds.length) {
      await this.db.from("recommendation_items").delete().in("run_id", runIds);
      await this.db.from("recommendation_runs").delete().in("id", runIds);
    }
  }

  async listWatchlist(profileId = DEFAULT_PROFILE_ID) {
    try {
      const rows = await this.fetchAllRows((from, to) =>
        this.db
          .from("watchlist_items")
          .select("*")
          .eq("profile_id", profileId)
          .order("added_at", { ascending: false })
          .order("tmdb_id")
          .range(from, to)
      );
      return rows.map(dbWatchlistToWatchlistItem);
    } catch (error) {
      console.warn("Watchlist unavailable", error instanceof Error ? error.message : error);
      return [];
    }
  }

  async upsertWatchlistItem(tmdbId: number, status: WatchlistStatus, profileId = DEFAULT_PROFILE_ID) {
    await this.ensureProfile(profileId);
    const { data, error } = await this.db
      .from("watchlist_items")
      .upsert(
        { profile_id: profileId, tmdb_id: tmdbId, status, resolved_at: status === "queued" ? null : now() },
        { onConflict: "profile_id,tmdb_id" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return dbWatchlistToWatchlistItem(data as unknown as Record<string, unknown>);
  }

  async removeWatchlistItem(tmdbId: number, profileId = DEFAULT_PROFILE_ID) {
    const { error } = await this.db.from("watchlist_items").delete().eq("profile_id", profileId).eq("tmdb_id", tmdbId);
    if (error) throw error;
  }

  async getMovieEnrichment(tmdbId: number) {
    const { data, error } = await this.db.from("movie_enrichments").select("*").eq("tmdb_id", tmdbId).maybeSingle();
    if (error || !data) return null;
    return dbEnrichmentToMovieEnrichment(data as unknown as Record<string, unknown>);
  }

  async listMovieEnrichments() {
    const rows: Record<string, unknown>[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.db.from("movie_enrichments").select("*").range(from, from + pageSize - 1);
      if (error) {
        console.warn("Movie enrichments unavailable", error.message);
        break;
      }
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < pageSize) break;
    }
    return rows.map(dbEnrichmentToMovieEnrichment);
  }

  async saveMovieEnrichment(enrichment: MovieEnrichment) {
    const { error } = await this.db.from("movie_enrichments").upsert(
      {
        tmdb_id: enrichment.tmdbId,
        version: enrichment.version,
        essence: enrichment.essence,
        trait_count: enrichment.traitCount,
        enriched_at: enrichment.enrichedAt
      },
      { onConflict: "tmdb_id" }
    );
    if (error) throw error;
  }

  async listTaxonomyEmbeddings(version?: string) {
    let query = this.db.from("taxonomy_embeddings").select("trait_id,version,embedding,updated_at");
    if (version) query = query.eq("version", version);
    const { data, error } = await query;
    if (error) {
      console.warn("Taxonomy embeddings unavailable", error.message);
      return [];
    }
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      traitId: String(row.trait_id),
      version: String(row.version),
      embedding: parseEmbedding(row.embedding),
      updatedAt: (row.updated_at as string | undefined) ?? undefined
    }));
  }

  async saveTaxonomyEmbeddings(embeddings: TaxonomyEmbedding[]) {
    if (!embeddings.length) return;
    const rows = embeddings.map((embedding) => ({
      trait_id: embedding.traitId,
      version: embedding.version,
      embedding: embedding.embedding,
      updated_at: embedding.updatedAt ?? now()
    }));
    for (const chunk of chunkArray(rows, 200)) {
      const { error } = await this.db.from("taxonomy_embeddings").upsert(chunk, { onConflict: "trait_id" });
      if (error) throw error;
    }
  }

  async exportData(profileId = DEFAULT_PROFILE_ID) {
    const [movies, ratings, ratingReasons, ratingTraitReasons, exposures, comparisons, appealSignals, watchlist, recommendationRuns, hiddenRecommendations] =
      await Promise.all([
        this.listMovies(),
        this.listRatings(profileId),
        this.listRatingReasons(profileId),
        this.listRatingTraitReasons(profileId),
        this.listExposures(profileId),
        this.listComparisons(profileId),
        this.listAppealSignals(profileId),
        this.listWatchlist(profileId),
        this.listRecommendationRuns(profileId),
        this.listHiddenRecommendations(profileId)
      ]);
    return { movies, ratings, ratingReasons, ratingTraitReasons, exposures, comparisons, appealSignals, watchlist, recommendationRuns, hiddenRecommendations };
  }
}

let memoizedStore: MovieStore | null = null;

export function getStore(): MovieStore {
  if (memoizedStore) return memoizedStore;
  memoizedStore = supabaseConfigured() ? new SupabaseMovieStore(supabaseClient()) : new LocalJsonStore();
  return memoizedStore;
}
