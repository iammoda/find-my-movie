import type { Genre, RatingValue, TasteKind } from "@/lib/types";

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
  director: 0.2
};

export const TMDB_ATTRIBUTION =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";
