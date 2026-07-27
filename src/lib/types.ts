export type RatingValue = "best_ever" | "like" | "skip" | "dislike" | "hate";

export type Verdict = "loved" | "fine" | "disliked";

export type AppealSignalValue = "want_to_watch" | "not_interested";

export type MediaType = "movie" | "tv";

export type RatingReasonValue = "story" | "tone" | "character" | "pacing" | "visuals_world" | "ending_payoff";
export type RatingReasonSentiment = "positive" | "negative";

export type BrowseCategory = "taste_test" | "popular" | "top_rated" | "genre";

export type ExposureSource = "taste_test" | "manual_search" | "popular" | "top_rated" | "genre" | "recommendation" | "not_seen";

export type TasteKind =
  | "tone"
  | "pacing"
  | "theme"
  | "conflict"
  | "stakes"
  | "emotional_payoff"
  | "structure"
  | "protagonist"
  | "genre"
  | "period"
  | "setting"
  | "cast"
  | "director";

export interface Genre {
  id: number;
  name: string;
}

export interface MovieCredit {
  tmdbId: number;
  director: string | null;
  actors: string[];
  crew?: string[];
  updatedAt?: string;
}

export interface TasteFact {
  tmdbId: number;
  kind: TasteKind;
  value: string;
  weight: number;
  source: "tmdb" | "heuristic" | "curated" | "taxonomy" | "llm";
}

export interface MovieTasteTrait {
  id: string;
  label: string;
  kind: TasteKind;
  weight: number;
}

export interface Movie {
  tmdbId: number;
  title: string;
  originalTitle?: string | null;
  originalLanguage?: string | null;
  overview: string;
  posterPath: string | null;
  backdropPath?: string | null;
  releaseDate?: string | null;
  runtime?: number | null;
  voteAverage: number;
  voteCount: number;
  popularity: number;
  adult: boolean;
  genres: Genre[];
  keywords: string[];
  countries: string[];
  credits?: MovieCredit | null;
  tasteFacts?: TasteFact[];
  tasteTraits?: MovieTasteTrait[];
  essence?: string | null;
  sourcePayload?: unknown;
  updatedAt?: string;
}

export interface Rating {
  profileId: string;
  tmdbId: number;
  rating: RatingValue;
  verdict?: Verdict | null;
  rankScore?: number | null;
  mediaType?: MediaType;
  createdAt: string;
  updatedAt: string;
}

export interface Comparison {
  id: string;
  profileId: string;
  winnerTmdbId: number;
  loserTmdbId: number;
  createdAt: string;
}

export interface AppealSignal {
  profileId: string;
  tmdbId: number;
  signal: AppealSignalValue;
  createdAt: string;
  updatedAt: string;
}

export type WatchlistStatus = "queued" | "watched" | "abandoned";

export interface WatchlistItem {
  profileId: string;
  tmdbId: number;
  status: WatchlistStatus;
  addedAt: string;
  resolvedAt?: string | null;
}

export interface MovieEnrichment {
  tmdbId: number;
  version: string;
  essence: string | null;
  traitCount: number;
  enrichedAt: string;
}

export interface TaxonomyEmbedding {
  traitId: string;
  version: string;
  embedding: number[];
  updatedAt?: string;
}

export interface ExposureBehavior {
  dwellMs?: number | null;
  flipped?: boolean;
  decisionMs?: number | null;
}

export interface RatingReason {
  id: string;
  profileId: string;
  tmdbId: number;
  reason: RatingReasonValue;
  sentiment: RatingReasonSentiment;
  createdAt: string;
}

export interface RatingTraitReason {
  id: string;
  profileId: string;
  tmdbId: number;
  traitId: string;
  sentiment: RatingReasonSentiment;
  createdAt: string;
}

export interface MovieExposure {
  id: string;
  profileId: string;
  tmdbId: number;
  source: ExposureSource;
  sourceDetail?: string | null;
  dwellMs?: number | null;
  flipped?: boolean;
  decisionMs?: number | null;
  createdAt: string;
}

export interface MovieEmbedding {
  tmdbId: number;
  model: string;
  featureText: string;
  embedding: number[];
  updatedAt?: string;
}

export interface MovieEmbeddingMatch {
  tmdbId: number;
  similarity: number;
}

export interface RecommendationScoreBreakdown {
  positiveTraitScore: number;
  negativeTraitPenalty: number;
  embeddingSimilarityScore: number;
  qualityScore: number;
  popularityScore: number;
  noveltyScore: number;
  diversityPenalty: number;
  topTraits: string[];
  avoidedTraits: string[];
  semanticScore?: number;
  positiveAnchorScore?: number;
  positiveMeanScore?: number;
  bestEverBonus?: number;
  negativeAnchorPenalty?: number;
  taxonomyPositiveScore?: number;
  taxonomyNegativePenalty?: number;
  clusterId?: string | null;
  matchedTaxonomyTraits?: string[];
  conflictedTaxonomyTraits?: string[];
  selectedTraitMatches?: string[];
  selectedTraitAvoidances?: string[];
  nearestPositiveMovies?: string[];
  nearestNegativeMovies?: string[];
  anchorScores?: Record<string, number>;
  predictedRankScore?: number;
  modelEmbeddingScore?: number;
  modelTraitScore?: number;
}

export interface RecommendationItem {
  id: string;
  runId: string;
  profileId: string;
  tmdbId: number;
  movie: Movie;
  rank: number;
  score: number;
  baselineScore: number;
  scoreBreakdown: RecommendationScoreBreakdown;
  explanation: string;
  createdAt: string;
}

export interface RecommendationRun {
  id: string;
  profileId: string;
  promptVersion: string;
  scoringVersion: string;
  status: "ready" | "cold_start" | "fallback" | "error";
  baselineAverage?: number | null;
  recommendationAverage?: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  items: RecommendationItem[];
}

export interface ExportPayload {
  movies: Movie[];
  ratings: Rating[];
  ratingReasons: RatingReason[];
  ratingTraitReasons: RatingTraitReason[];
  exposures: MovieExposure[];
  comparisons: Comparison[];
  appealSignals: AppealSignal[];
  watchlist: WatchlistItem[];
  recommendationRuns: RecommendationRun[];
  hiddenRecommendations: number[];
}
