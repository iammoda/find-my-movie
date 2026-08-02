import type { Genre, MediaType, RatingValue, TasteKind } from "@/lib/types";

export const DEFAULT_PROFILE_ID = "default";
/** Sentinel for anonymous (signed-out) reads; must never own data rows. */
export const ANONYMOUS_PROFILE_ID = "anon";

export const PROMPT_VERSION = "taxonomy-anchor-v2";
export const SCORING_VERSION = "learned-rank-v1";
export const LEGACY_SCORING_VERSION = "semantic-taxonomy-v2";

export const MIN_RECOMMENDATION_RATINGS = 10;
export const MIN_POSITIVE_RATINGS = 3;
export const MIN_PRIMARY_VOTE_COUNT = 750;
export const MIN_BROWSE_VOTE_COUNT = 500;
export const MIN_TOP_RATED_VOTE_COUNT = 1200;
export const MIN_GENRE_VOTE_COUNT = 650;
export const MIN_BROWSE_POPULARITY = 8;
export const MIN_STABLE_RELEASE_DAYS = 120;
export const PRIMARY_ORIGINAL_LANGUAGE = "en";
export const MAX_STARTER_POOL_MOVIES = 10000;
/** Catalog read cap across both media types (movies + tv share the table). */
export const MAX_CATALOG_ROWS = 18000;
export const RUNTIME_STARTER_POOL_MOVIES = 900;

// Recommendation scoring: soft floors replace the old hard candidate gates.
export const MIN_RECOMMENDATION_VOTE_AVERAGE = 7;
export const MIN_CANDIDATE_VOTE_COUNT = 300;
export const NON_PRIMARY_LANGUAGE_PENALTY = 0.6;

export const RATING_WEIGHTS: Record<RatingValue, number> = {
  best_ever: 3,
  like: 1,
  skip: 0,
  dislike: -1,
  hate: -3
};

export const POSITIVE_RATINGS = new Set<RatingValue>(["best_ever", "like"]);
export const NEGATIVE_RATINGS = new Set<RatingValue>(["dislike", "hate"]);

export const MOVIE_GENRES: Genre[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Sci-Fi" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" }
];

/** TMDB TV genre taxonomy (differs from movies: combined genres, no Horror/Thriller). */
export const TV_GENRES: Genre[] = [
  { id: 10759, name: "Action & Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 10762, name: "Kids" },
  { id: 9648, name: "Mystery" },
  { id: 10763, name: "News" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10766, name: "Soap" },
  { id: 10767, name: "Talk" },
  { id: 10768, name: "War & Politics" },
  { id: 37, name: "Western" }
];

export function genresForMedia(mediaType: MediaType): Genre[] {
  return mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
}

/**
 * Per-media calibration. TMDB TV shows carry ~5-10x fewer votes than
 * equivalently famous movies (Breaking Bad ~15k vs Inception ~38k; mid-tier
 * TV = hundreds), so every vote-based floor, shrinkage prior, and familiarity
 * normalizer needs its own scale per media type or TV mode would surface
 * near-empty decks and treat every show as obscure.
 */
export interface MediaProfile {
  /** Bayesian shrinkage pseudo-votes for weightedTmdbScore. */
  voteConfidence: number;
  /** log10 normalizer for vote-reach terms (familiarity, mainstream). */
  voteReachNorm: number;
  /** Linear vote scale for the seen-model feature (votes at "everyone knows it"). */
  voteLinearScale: number;
  minBrowseVoteCount: number;
  minTopRatedVoteCount: number;
  minGenreVoteCount: number;
  minBrowsePopularity: number;
  minTasteTestVoteAverage: number;
  relaxedMinVoteAverage: number;
  relaxedMinPopularity: number;
  anchorVoteCount: number;
  divisiveVoteCount: number;
  minCandidateVoteCount: number;
  minPrimaryVoteCount: number;
  obscureVoteThreshold: number;
}

export const MEDIA_PROFILES: Record<MediaType, MediaProfile> = {
  movie: {
    voteConfidence: 800,
    voteReachNorm: 4,
    voteLinearScale: 10000,
    minBrowseVoteCount: MIN_BROWSE_VOTE_COUNT,
    minTopRatedVoteCount: MIN_TOP_RATED_VOTE_COUNT,
    minGenreVoteCount: MIN_GENRE_VOTE_COUNT,
    minBrowsePopularity: MIN_BROWSE_POPULARITY,
    minTasteTestVoteAverage: 6.25,
    relaxedMinVoteAverage: 6.0,
    relaxedMinPopularity: 5,
    anchorVoteCount: 4000,
    divisiveVoteCount: 2500,
    minCandidateVoteCount: MIN_CANDIDATE_VOTE_COUNT,
    minPrimaryVoteCount: MIN_PRIMARY_VOTE_COUNT,
    obscureVoteThreshold: 3000
  },
  tv: {
    voteConfidence: 250,
    voteReachNorm: 3.4,
    voteLinearScale: 1500,
    minBrowseVoteCount: 100,
    minTopRatedVoteCount: 250,
    minGenreVoteCount: 130,
    minBrowsePopularity: 8,
    // TMDB TV averages skew higher (fan-vote bias), so quality floors sit up a notch.
    minTasteTestVoteAverage: 6.5,
    relaxedMinVoteAverage: 6.2,
    relaxedMinPopularity: 5,
    anchorVoteCount: 800,
    divisiveVoteCount: 500,
    minCandidateVoteCount: 75,
    minPrimaryVoteCount: 150,
    obscureVoteThreshold: 500
  }
};

export const DEEP_TASTE_KINDS = new Set<TasteKind>([
  "tone",
  "pacing",
  "theme",
  "conflict",
  "stakes",
  "emotional_payoff",
  "structure",
  "protagonist"
]);

export const TASTE_KIND_MULTIPLIERS: Record<TasteKind, number> = {
  tone: 1.2,
  pacing: 1,
  theme: 1.15,
  conflict: 1.15,
  stakes: 1.05,
  emotional_payoff: 1.1,
  structure: 1.15,
  protagonist: 0.95,
  genre: 0.45,
  period: 0.3,
  setting: 0.25,
  cast: 0.16,
  director: 0.2,
  // TV format (limited series vs long-runner) is a real preference axis.
  format: 0.9,
  // Media bias feature: lets the shared taste model learn "rates TV differently".
  media: 0.6
};

export const TMDB_ATTRIBUTION =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";
