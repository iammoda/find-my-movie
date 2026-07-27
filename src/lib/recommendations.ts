import {
  DEFAULT_PROFILE_ID,
  MIN_CANDIDATE_VOTE_COUNT,
  MIN_PRIMARY_VOTE_COUNT,
  MIN_RECOMMENDATION_VOTE_AVERAGE,
  MIN_STABLE_RELEASE_DAYS,
  NEGATIVE_RATINGS,
  NON_PRIMARY_LANGUAGE_PENALTY,
  POSITIVE_RATINGS,
  PROMPT_VERSION,
  SCORING_VERSION,
  TASTE_KIND_MULTIPLIERS
} from "@/lib/constants";
import { isPrimaryAudienceMovie } from "@/lib/language";
import { baselineScore, isReleasedAtLeastDaysAgo, qualityScore, releaseDecade } from "@/lib/quality";
import { VERDICT_BANDS } from "@/lib/ranking";
import { ratingWeight, recommendationReadiness } from "@/lib/rating";
import type { MovieStore } from "@/lib/store";
import { FEATURE_TEXT_VERSION, deriveTasteFacts, factKey, isDeepFact } from "@/lib/taste";
import {
  buildScoreCalibrator,
  loadTasteModel,
  predictTasteScore,
  predictedRankScore,
  type ScoreCalibrator,
  type TasteModel,
  type TastePrediction
} from "@/lib/tasteModel";
import { TAXONOMY_VERSION, taxonomyLabelFor } from "@/lib/taxonomy";
import type {
  Movie,
  MovieEmbedding,
  MovieExposure,
  Rating,
  RatingReason,
  RatingReasonValue,
  RatingTraitReason,
  RecommendationItem,
  RecommendationScoreBreakdown,
  RecommendationRun,
  TasteFact
} from "@/lib/types";

const ANCHOR_MATCH_COUNT = 350;
const LOVED_ANCHOR_COUNT = 5;
const LOVED_ANCHOR_MATCH_COUNT = 150;
const MAX_CANDIDATE_POOL = 500;
const MODEL_SCORE_WEIGHT = 6;

interface TasteSignal {
  fact: TasteFact;
  score: number;
  count: number;
}

interface TasteProfile {
  positive: Map<string, TasteSignal>;
  negative: Map<string, TasteSignal>;
  positiveRatings: Rating[];
  negativeRatings: Rating[];
  ratingReasons: RatingReason[];
  ratingTraitReasons: RatingTraitReason[];
  traitSpecificity: Map<string, number>;
}

interface ScoredCandidate {
  movie: Movie;
  score: number;
  baselineScore: number;
  breakdown: RecommendationScoreBreakdown;
  explanation: string;
}

interface ScoreMovieOptions {
  embeddingSimilarity?: number;
  semantic?: SemanticMovieContext;
}

export interface TasteAnchor {
  id: string;
  label: string;
  weight: number;
  vector: number[];
  sourceTmdbIds: number[];
}

export interface RatedEmbeddingContext {
  tmdbId: number;
  title: string;
  rating: Rating["rating"];
  vector: number[];
}

export interface SemanticMovieContext {
  semanticScore: number;
  positiveAnchorScore: number;
  positiveMeanScore: number;
  bestEverBonus: number;
  negativeAnchorPenalty: number;
  anchorScores: Record<string, number>;
  nearestPositiveMovies: string[];
  nearestNegativeMovies: string[];
  clusterId: string | null;
}

export interface RecommendationResult {
  ready: boolean;
  readiness: ReturnType<typeof recommendationReadiness>;
  run: RecommendationRun | null;
  recommendations: RecommendationItem[];
  fallback: boolean;
}

function addSignal(map: Map<string, TasteSignal>, fact: TasteFact, score: number) {
  const key = factKey(fact);
  const cap =
    fact.kind === "cast"
      ? 0.55
      : fact.kind === "director"
        ? 0.7
        : fact.source === "taxonomy"
          ? 36
          : fact.kind === "genre" || fact.kind === "setting" || fact.kind === "period"
            ? 5
            : fact.source === "heuristic"
              ? 16
              : 24;
  const existing = map.get(key);
  if (existing) {
    existing.score = Math.min(cap, existing.score + score);
    existing.count += 1;
    existing.fact.weight = Math.max(existing.fact.weight, fact.weight);
  } else {
    map.set(key, { fact, score: Math.min(cap, score), count: 1 });
  }
}

function ratingSourceFor(rating: Rating, exposures: MovieExposure[] = []) {
  const ratingTime = Date.parse(rating.updatedAt);
  const matching = exposures
    .filter((exposure) => exposure.tmdbId === rating.tmdbId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const beforeRating = matching.find((exposure) => Date.parse(exposure.createdAt) <= ratingTime);
  return beforeRating?.source ?? matching[0]?.source ?? null;
}

function sourceSignalMultiplier(rating: Rating, source: MovieExposure["source"] | null) {
  let sourceMultiplier = 1;

  if (source === "manual_search") sourceMultiplier = 1.55;
  else if (source === "taste_test") sourceMultiplier = 1.2;
  else if (source === "recommendation") sourceMultiplier = 1.1;
  else if (source === "top_rated") {
    sourceMultiplier = ratingWeight(rating.rating) > 0 ? 0.45 : 1.2;
  } else if (source === "popular") {
    sourceMultiplier = ratingWeight(rating.rating) > 0 ? 0.75 : 1.15;
  } else if (source === "genre") sourceMultiplier = 0.95;

  if (rating.rating === "best_ever") return sourceMultiplier * 1.25;
  if (rating.rating === "hate") return sourceMultiplier * 1.2;
  return sourceMultiplier;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return null;
  return vector.map((value) => value / magnitude);
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

function averageEmbeddingVector(items: Array<{ vector: number[]; weight: number }>) {
  const first = items.find((item) => item.vector.length)?.vector;
  if (!first) return null;

  const vector = new Array(first.length).fill(0) as number[];
  let totalWeight = 0;
  for (const item of items) {
    if (!item.vector.length) continue;
    totalWeight += Math.abs(item.weight);
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] += (item.vector[index] ?? 0) * item.weight;
    }
  }
  if (!totalWeight) return null;
  return normalizeVector(vector.map((value) => value / totalWeight));
}

function ratingIsManual(rating: Rating, exposures: MovieExposure[]) {
  return ratingSourceFor(rating, exposures) === "manual_search";
}

export function buildTasteAnchors(
  movies: Movie[],
  ratings: Rating[],
  embeddings: MovieEmbedding[],
  exposures: MovieExposure[]
): { positiveAnchors: TasteAnchor[]; negativeAnchor: TasteAnchor | null; ratedContexts: RatedEmbeddingContext[] } {
  const movieById = new Map(movies.map((movie) => [movie.tmdbId, movie]));
  const embeddingById = new Map(embeddings.map((embedding) => [embedding.tmdbId, embedding.embedding]));
  const positives = ratings.filter((rating) => POSITIVE_RATINGS.has(rating.rating) && embeddingById.get(rating.tmdbId)?.length);
  const negatives = ratings.filter((rating) => NEGATIVE_RATINGS.has(rating.rating) && embeddingById.get(rating.tmdbId)?.length);
  const positiveAnchors: TasteAnchor[] = [];

  const anchorFromRatings = (id: string, label: string, anchorRatings: Rating[], weight: number) => {
    const vector = averageEmbeddingVector(
      anchorRatings.flatMap((rating) => {
        const vector = embeddingById.get(rating.tmdbId);
        if (!vector) return [];
        return [{ vector, weight: Math.max(0.1, ratingWeight(rating.rating) * sourceSignalMultiplier(rating, ratingSourceFor(rating, exposures))) }];
      })
    );
    if (!vector) return;
    positiveAnchors.push({
      id,
      label,
      weight,
      vector,
      sourceTmdbIds: anchorRatings.map((rating) => rating.tmdbId)
    });
  };

  anchorFromRatings("positive", "all positive ratings", positives, 1);
  anchorFromRatings("best_ever", "best-ever movies", positives.filter((rating) => rating.rating === "best_ever"), 1.35);
  anchorFromRatings("manual_positive", "searched favorites", positives.filter((rating) => ratingIsManual(rating, exposures)), 1.25);
  anchorFromRatings(
    "recent_positive",
    "recent positive ratings",
    [...positives].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12),
    0.75
  );

  for (const rating of positives.filter((item) => item.rating === "best_ever").slice(0, 8)) {
    const vector = embeddingById.get(rating.tmdbId);
    const movie = movieById.get(rating.tmdbId);
    if (!vector?.length || !movie) continue;
    positiveAnchors.push({
      id: `best_${rating.tmdbId}`,
      label: movie.title,
      weight: 1.15,
      vector,
      sourceTmdbIds: [rating.tmdbId]
    });
  }

  const negativeVector = averageEmbeddingVector(
    negatives.flatMap((rating) => {
      const vector = embeddingById.get(rating.tmdbId);
      if (!vector) return [];
      return [{ vector, weight: Math.abs(ratingWeight(rating.rating)) * sourceSignalMultiplier(rating, ratingSourceFor(rating, exposures)) }];
    })
  );
  const negativeAnchor = negativeVector
    ? {
        id: "negative",
        label: "disliked movies",
        weight: 1.1,
        vector: negativeVector,
        sourceTmdbIds: negatives.map((rating) => rating.tmdbId)
      }
    : null;

  const ratedContexts = ratings.flatMap((rating) => {
    const vector = embeddingById.get(rating.tmdbId);
    const movie = movieById.get(rating.tmdbId);
    if (!vector?.length || !movie || rating.rating === "skip") return [];
    return [{ tmdbId: rating.tmdbId, title: movie.title, rating: rating.rating, vector }];
  });

  return { positiveAnchors, negativeAnchor, ratedContexts };
}

function reasonFacets(reason: RatingReasonValue) {
  if (reason === "story") return new Set(["structure", "theme", "conflict"]);
  if (reason === "tone") return new Set(["tone"]);
  if (reason === "character") return new Set(["protagonist", "theme"]);
  if (reason === "pacing") return new Set(["pacing", "structure"]);
  if (reason === "visuals_world") return new Set(["tone", "theme", "stakes"]);
  return new Set(["emotional_payoff"]);
}

function taxonomySpecificityForMovies(movies: Movie[]) {
  const counts = new Map<string, number>();
  for (const movie of movies) {
    const keys = new Set(
      deriveTasteFacts(movie)
        .filter((fact) => fact.source === "taxonomy")
        .map((fact) => factKey(fact))
    );
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = Math.max(1, movies.length);
  const specificity = new Map<string, number>();
  for (const [key, count] of counts.entries()) {
    const idf = Math.log(1 + total / (1 + count));
    specificity.set(key, Math.min(1.35, Math.max(0.45, idf / 2.1)));
  }
  return specificity;
}

export function buildTasteProfile(
  movies: Movie[],
  ratings: Rating[],
  exposures: MovieExposure[] = [],
  ratingReasons: RatingReason[] = [],
  ratingTraitReasons: RatingTraitReason[] = []
): TasteProfile {
  const byId = new Map(movies.map((movie) => [movie.tmdbId, movie]));
  const traitSpecificity = taxonomySpecificityForMovies(movies);
  const reasonsByMovie = new Map<number, RatingReason[]>();
  for (const reason of ratingReasons) {
    const bucket = reasonsByMovie.get(reason.tmdbId) ?? [];
    bucket.push(reason);
    reasonsByMovie.set(reason.tmdbId, bucket);
  }
  const traitReasonsByMovieSentiment = new Map<string, Set<string>>();
  for (const reason of ratingTraitReasons) {
    const key = `${reason.tmdbId}:${reason.sentiment}`;
    const bucket = traitReasonsByMovieSentiment.get(key) ?? new Set<string>();
    bucket.add(reason.traitId);
    traitReasonsByMovieSentiment.set(key, bucket);
  }
  const profile: TasteProfile = {
    positive: new Map(),
    negative: new Map(),
    positiveRatings: ratings.filter((rating) => POSITIVE_RATINGS.has(rating.rating)),
    negativeRatings: ratings.filter((rating) => NEGATIVE_RATINGS.has(rating.rating)),
    ratingReasons,
    ratingTraitReasons,
    traitSpecificity
  };

  for (const rating of ratings) {
    if (rating.rating === "skip") continue;
    const movie = byId.get(rating.tmdbId);
    if (!movie) continue;

    const weight = ratingWeight(rating.rating);
    const sourceMultiplier = sourceSignalMultiplier(rating, ratingSourceFor(rating, exposures));
    const sentiment = weight > 0 ? "positive" : "negative";
    const facts = deriveTasteFacts(movie);
    const storedSelectedTraitIds = traitReasonsByMovieSentiment.get(`${rating.tmdbId}:${sentiment}`) ?? new Set<string>();
    const selectedTraitIds = new Set(
      facts.filter((fact) => fact.source === "taxonomy" && storedSelectedTraitIds.has(fact.value)).map((fact) => fact.value)
    );
    const relevantReasons = selectedTraitIds.size
      ? []
      : (reasonsByMovie.get(rating.tmdbId) ?? []).filter((reason) => reason.sentiment === sentiment);
    const boostedFacets = new Set(relevantReasons.flatMap((reason) => [...reasonFacets(reason.reason)]));
    const rawSignals = facts.map((fact) => {
      const kindMultiplier = TASTE_KIND_MULTIPLIERS[fact.kind];
      const reasonMultiplier = boostedFacets.has(fact.kind) ? 1.55 : 1;
      const taxonomyMultiplier = fact.source === "taxonomy" ? 1.35 : 0.45;
      const specificity = fact.source === "taxonomy" ? (traitSpecificity.get(factKey(fact)) ?? 1) : 1;
      const signal = Math.abs(weight) * sourceMultiplier * fact.weight * kindMultiplier * reasonMultiplier * taxonomyMultiplier * specificity;
      const selectedTraitMultiplier =
        selectedTraitIds.size && fact.source === "taxonomy" ? (selectedTraitIds.has(fact.value) ? 2.15 : 0.45) : 1;
      return { fact, signal, focusedSignal: signal * selectedTraitMultiplier };
    });
    const rawTotal = rawSignals.reduce((sum, item) => sum + item.signal, 0);
    const focusedTotal = rawSignals.reduce((sum, item) => sum + item.focusedSignal, 0);
    const selectedTraitNormalizer = selectedTraitIds.size && focusedTotal > 0 ? rawTotal / focusedTotal : 1;

    for (const { fact, focusedSignal } of rawSignals) {
      const signal = focusedSignal * selectedTraitNormalizer;
      if (weight > 0) addSignal(profile.positive, fact, signal);
      if (weight < 0) addSignal(profile.negative, fact, signal);
    }
  }

  return profile;
}

function shallowOneOffMultiplier(signal: TasteSignal) {
  if (isDeepFact(signal.fact)) return signal.count >= 2 ? 1.25 : 1;
  return signal.count >= 2 ? 0.85 : 0.2;
}

function candidateUsable(movie: Movie) {
  // Hard gate only: displayable + minimally credible. Quality/language/recency are
  // soft-scored below so acclaimed foreign films, gems, and new releases can surface.
  return (
    !movie.adult &&
    Boolean(movie.posterPath) &&
    Boolean(movie.overview) &&
    movie.voteCount >= MIN_CANDIDATE_VOTE_COUNT
  );
}

/**
 * Soft penalty (subtracted from a candidate's score) that replaces the old hard filters.
 * Lets the learned model override it, but keeps low-credibility / off-language / very
 * fresh titles from dominating on thin evidence.
 */
function candidateSoftPenalty(movie: Movie): number {
  let penalty = 0;

  if (movie.voteAverage < MIN_RECOMMENDATION_VOTE_AVERAGE) {
    penalty += (MIN_RECOMMENDATION_VOTE_AVERAGE - movie.voteAverage) * 0.35;
  }
  if (movie.voteCount < MIN_PRIMARY_VOTE_COUNT) {
    penalty += Math.min(2, Math.log10(MIN_PRIMARY_VOTE_COUNT / Math.max(1, movie.voteCount))) * 0.8;
  }
  if (!isPrimaryAudienceMovie(movie)) {
    penalty += NON_PRIMARY_LANGUAGE_PENALTY;
  }
  if (!isReleasedAtLeastDaysAgo(movie.releaseDate, MIN_STABLE_RELEASE_DAYS)) {
    penalty += 0.3;
  }
  return penalty;
}

function positiveSignalFor(positive?: TasteSignal, negative?: TasteSignal) {
  if (!positive) return 0;
  const negativeScore = negative?.score ?? 0;
  const netScore = positive.score - negativeScore * 1.15;
  if (netScore <= 0) return 0;
  if (!negativeScore) return positive.score;

  const confidence = positive.score / (positive.score + negativeScore);
  return netScore * Math.max(0.2, confidence);
}

function negativeSignalFor(negative?: TasteSignal, positive?: TasteSignal) {
  if (!negative) return 0;
  const positiveScore = positive?.score ?? 0;
  if (!positiveScore) return negative.score;

  const netScore = negative.score - positiveScore * 0.45;
  if (netScore > 0) return netScore;

  return negative.score * 0.45;
}

function explainCandidate(breakdown: RecommendationScoreBreakdown) {
  const picked = (
    breakdown.selectedTraitMatches?.length
      ? breakdown.selectedTraitMatches
      : breakdown.matchedTaxonomyTraits?.length
        ? breakdown.matchedTaxonomyTraits
        : breakdown.topTraits
  ).slice(0, 3);
  const nearest = breakdown.nearestPositiveMovies?.slice(0, 2) ?? [];

  if (nearest.length && picked.length >= 2) {
    return `Closest to ${nearest.join(" and ")}; matches your taste for ${picked.join(", ")}.`;
  }

  if (nearest.length) {
    return `Closest to ${nearest.join(" and ")} with quality and negative-match guardrails applied.`;
  }

  if (picked.length === 1) {
    return `Best match centers on ${picked[0]}, with genre and setting kept secondary.`;
  }

  return "Ranked mainly by semantic taste similarity and quality because taxonomy evidence is still thin.";
}

export function scoreMovieCandidate(movie: Movie, profile: TasteProfile, exposedIds: Set<number>, options: ScoreMovieOptions = {}): ScoredCandidate {
  let taxonomyPositiveRaw = 0;
  let taxonomyNegativeRaw = 0;
  let fallbackPositiveRaw = 0;
  let fallbackNegativeRaw = 0;
  let conflictTraitPenalty = 0;
  let hardNegativePenalty = 0;
  const topTraits: Array<{ label: string; score: number }> = [];
  const avoidedTraits: Array<{ label: string; score: number }> = [];
  const matchedTaxonomyTraits: Array<{ label: string; score: number }> = [];
  const selectedTraitMatches: Array<{ label: string; score: number }> = [];
  const selectedTraitAvoidances: Array<{ label: string; score: number }> = [];
  const conflictedTaxonomyTraits = new Set<string>();
  const embeddingSimilarityScore = Math.max(0, options.embeddingSimilarity ?? 0);
  const selectedPositiveTraitIds = new Set(profile.ratingTraitReasons.filter((reason) => reason.sentiment === "positive").map((reason) => reason.traitId));
  const selectedNegativeTraitIds = new Set(profile.ratingTraitReasons.filter((reason) => reason.sentiment === "negative").map((reason) => reason.traitId));

  for (const fact of deriveTasteFacts(movie)) {
    const key = factKey(fact);
    const positive = profile.positive.get(key);
    const negative = profile.negative.get(key);
    const positiveSignal = positiveSignalFor(positive, negative);
    const negativeSignal = negativeSignalFor(negative, positive);
    const positiveDominates =
      !negative || ((positive?.score ?? 0) >= negative.score * 4 && positiveSignal > negativeSignal * 2.5);
    const isTaxonomy = fact.source === "taxonomy";
    const specificity = isTaxonomy ? (profile.traitSpecificity.get(key) ?? 1) : 1;
    const displayLabel = isTaxonomy ? taxonomyLabelFor(fact.value) : `${fact.kind}:${fact.value}`;
    const displayablePositiveTrait = isTaxonomy || (fact.source !== "tmdb" && isDeepFact(fact));

    if (positive && positiveSignal > 0) {
      const conflictMultiplier = negative ? 0.35 : 1;
      const contribution = positiveSignal * fact.weight * shallowOneOffMultiplier(positive) * conflictMultiplier * specificity;
      if (isTaxonomy) taxonomyPositiveRaw += contribution;
      else if (isDeepFact(fact)) fallbackPositiveRaw += contribution * 0.25;
      if (positiveDominates && displayablePositiveTrait) {
        topTraits.push({ label: displayLabel, score: contribution });
        if (isTaxonomy) matchedTaxonomyTraits.push({ label: displayLabel, score: contribution });
      }
      if (isTaxonomy && selectedPositiveTraitIds.has(fact.value)) {
        selectedTraitMatches.push({ label: displayLabel, score: contribution });
      }
    }

    if (positive && negative) {
      conflictTraitPenalty += Math.min(positive.score, negative.score) * fact.weight * (isDeepFact(fact) ? 0.9 : 0.4) * specificity;
      if (isTaxonomy) conflictedTaxonomyTraits.add(displayLabel);
    }

    if (negative && negativeSignal > 0) {
      const penalty = negativeSignal * fact.weight * (negative.count >= 2 ? 1.3 : 1) * specificity;
      if (isTaxonomy) taxonomyNegativeRaw += penalty;
      else if (isDeepFact(fact)) fallbackNegativeRaw += penalty * 0.75;
      if (!positive || negative.score >= positive.score * 1.5) {
        avoidedTraits.push({ label: displayLabel, score: penalty });
      }
      if (isTaxonomy && selectedNegativeTraitIds.has(fact.value)) {
        selectedTraitAvoidances.push({ label: displayLabel, score: penalty });
      }
      if (!positive && negative.score >= 1.5 && isDeepFact(fact)) {
        hardNegativePenalty += 9 * fact.weight;
      }
    }
  }

  const qScore = qualityScore(movie);
  const pScore = Math.min(1, Math.log10(Math.max(1, movie.popularity)) / 3);
  const noveltyScore = exposedIds.has(movie.tmdbId) ? -0.08 : 0.12;
  const base = baselineScore(movie);
  const taxonomyPositiveScore = Math.log1p(taxonomyPositiveRaw) * 2.1;
  const taxonomyNegativePenalty = Math.log1p(taxonomyNegativeRaw + conflictTraitPenalty) * 2.6 + hardNegativePenalty;
  const fallbackPositiveScore = Math.log1p(fallbackPositiveRaw) * 0.7;
  const fallbackNegativePenalty = Math.log1p(fallbackNegativeRaw) * 0.9;
  const semantic = options.semantic;
  const semanticScore = semantic?.semanticScore ?? embeddingSimilarityScore * 5.5;
  const score =
    semanticScore +
    taxonomyPositiveScore * 0.45 -
    taxonomyNegativePenalty * 0.75 +
    fallbackPositiveScore -
    fallbackNegativePenalty +
    qScore * 0.75 +
    pScore * 0.15 +
    noveltyScore +
    0;

  const breakdown: RecommendationScoreBreakdown = {
    positiveTraitScore: Number((taxonomyPositiveScore + fallbackPositiveScore).toFixed(4)),
    negativeTraitPenalty: Number((taxonomyNegativePenalty + fallbackNegativePenalty).toFixed(4)),
    embeddingSimilarityScore: Number(embeddingSimilarityScore.toFixed(4)),
    qualityScore: Number(qScore.toFixed(4)),
    popularityScore: Number(pScore.toFixed(4)),
    noveltyScore,
    diversityPenalty: 0,
    topTraits: topTraits
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((trait) => trait.label),
    avoidedTraits: avoidedTraits
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((trait) => trait.label),
    semanticScore: Number(semanticScore.toFixed(4)),
    positiveAnchorScore: semantic?.positiveAnchorScore ?? 0,
    positiveMeanScore: semantic?.positiveMeanScore ?? 0,
    bestEverBonus: semantic?.bestEverBonus ?? 0,
    negativeAnchorPenalty: semantic?.negativeAnchorPenalty ?? 0,
    taxonomyPositiveScore: Number(taxonomyPositiveScore.toFixed(4)),
    taxonomyNegativePenalty: Number(taxonomyNegativePenalty.toFixed(4)),
    clusterId: semantic?.clusterId ?? null,
    matchedTaxonomyTraits: matchedTaxonomyTraits
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((trait) => trait.label),
    conflictedTaxonomyTraits: [...conflictedTaxonomyTraits].slice(0, 5),
    selectedTraitMatches: selectedTraitMatches
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((trait) => trait.label),
    selectedTraitAvoidances: selectedTraitAvoidances
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((trait) => trait.label),
    nearestPositiveMovies: semantic?.nearestPositiveMovies ?? [],
    nearestNegativeMovies: semantic?.nearestNegativeMovies ?? [],
    anchorScores: semantic?.anchorScores ?? {}
  };

  return {
    movie,
    score,
    baselineScore: base,
    breakdown,
    explanation: explainCandidate(breakdown)
  };
}

function nearestRatedMovies(vector: number[], rated: RatedEmbeddingContext[], positive: boolean) {
  return rated
    .filter((item) => (positive ? POSITIVE_RATINGS.has(item.rating) : NEGATIVE_RATINGS.has(item.rating)))
    .map((item) => ({
      title: item.title,
      similarity: cosineSimilarity(vector, item.vector)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
    .map((item) => item.title);
}

export function semanticContextForMovie(
  movie: Movie,
  embedding: number[] | undefined,
  positiveAnchors: TasteAnchor[],
  negativeAnchor: TasteAnchor | null,
  ratedContexts: RatedEmbeddingContext[]
): SemanticMovieContext {
  if (!embedding?.length || !positiveAnchors.length) {
    return {
      semanticScore: 0,
      positiveAnchorScore: 0,
      positiveMeanScore: 0,
      bestEverBonus: 0,
      negativeAnchorPenalty: 0,
      anchorScores: {},
      nearestPositiveMovies: [],
      nearestNegativeMovies: [],
      clusterId: null
    };
  }

  const anchorScores = Object.fromEntries(
    positiveAnchors.map((anchor) => [anchor.id, Number((Math.max(0, cosineSimilarity(embedding, anchor.vector)) * anchor.weight).toFixed(4))])
  );
  const sortedAnchorScores = Object.entries(anchorScores).sort((a, b) => b[1] - a[1]);
  const positiveAnchorScore = sortedAnchorScores[0]?.[1] ?? 0;
  const positiveMeanScore = sortedAnchorScores.length
    ? sortedAnchorScores.reduce((sum, [, score]) => sum + score, 0) / sortedAnchorScores.length
    : 0;
  const bestEverBonus = sortedAnchorScores
    .filter(([id]) => id === "best_ever" || id.startsWith("best_"))
    .reduce((max, [, score]) => Math.max(max, score), 0);
  const negativeAnchorPenalty = negativeAnchor ? Math.max(0, cosineSimilarity(embedding, negativeAnchor.vector)) * negativeAnchor.weight : 0;
  const clusterId = sortedAnchorScores[0]?.[0] ?? null;
  const semanticScore = positiveAnchorScore * 5.5 + positiveMeanScore * 2 + bestEverBonus * 1.5 - negativeAnchorPenalty * 4;

  return {
    semanticScore: Number(semanticScore.toFixed(4)),
    positiveAnchorScore: Number(positiveAnchorScore.toFixed(4)),
    positiveMeanScore: Number(positiveMeanScore.toFixed(4)),
    bestEverBonus: Number(bestEverBonus.toFixed(4)),
    negativeAnchorPenalty: Number(negativeAnchorPenalty.toFixed(4)),
    anchorScores,
    nearestPositiveMovies: nearestRatedMovies(embedding, ratedContexts, true),
    nearestNegativeMovies: nearestRatedMovies(embedding, ratedContexts, false),
    clusterId: clusterId ? `${clusterId}:${movie.genres[0]?.name ?? "mixed"}` : null
  };
}

function applyDiversity(scored: ScoredCandidate[], limit: number): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const toneCounts = new Map<string, number>();
  const clusterCounts = new Map<string, number>();

  for (const candidate of scored) {
    const genres = candidate.movie.genres.map((genre) => genre.name);
    const decade = releaseDecade(candidate.movie.releaseDate);
    const tones = deriveTasteFacts(candidate.movie)
      .filter((fact) => fact.kind === "tone")
      .map((fact) => fact.value);

    const genrePenalty = genres.reduce((sum, genre) => sum + (genreCounts.get(genre) ?? 0) * 0.08, 0);
    const decadePenalty = (decadeCounts.get(decade) ?? 0) * 0.05;
    const tonePenalty = tones.reduce((sum, tone) => sum + (toneCounts.get(tone) ?? 0) * 0.08, 0);
    const clusterId = candidate.breakdown.clusterId;
    const clusterPenalty = clusterId ? (clusterCounts.get(clusterId) ?? 0) * 0.18 : 0;
    const diversityPenalty = genrePenalty + decadePenalty + tonePenalty + clusterPenalty;

    candidate.breakdown.diversityPenalty = Number(diversityPenalty.toFixed(4));
    candidate.score -= diversityPenalty;

    selected.push(candidate);
    for (const genre of genres) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
    for (const tone of tones) toneCounts.set(tone, (toneCounts.get(tone) ?? 0) + 1);
    if (clusterId) clusterCounts.set(clusterId, (clusterCounts.get(clusterId) ?? 0) + 1);

    if (selected.length >= limit * 2) break;
  }

  return selected.sort((a, b) => b.score - a.score).slice(0, limit);
}

function averageRatedScoreForSource(ratings: Rating[], movieIds: number[]) {
  const idSet = new Set(movieIds);
  const scored = ratings.filter((rating) => idSet.has(rating.tmdbId) && rating.rating !== "skip").map((rating) => ratingWeight(rating.rating));
  if (!scored.length) return null;
  return scored.reduce((sum, score) => sum + score, 0) / scored.length;
}

export interface LovedContext {
  title: string;
  vector: number[];
}

export function lovedContextsFor(movies: Movie[], ratings: Rating[], embeddingsById: Map<number, number[]>): LovedContext[] {
  const movieById = new Map(movies.map((movie) => [movie.tmdbId, movie]));
  return ratings
    .filter((rating) => (rating.rankScore ?? 0) >= VERDICT_BANDS.loved.min || POSITIVE_RATINGS.has(rating.rating))
    .flatMap((rating) => {
      const vector = embeddingsById.get(rating.tmdbId);
      const movie = movieById.get(rating.tmdbId);
      if (!vector?.length || !movie) return [];
      return [{ title: movie.title, vector }];
    });
}

function nearestLovedTitles(embedding: number[] | null | undefined, lovedContexts: LovedContext[]): string[] {
  if (!embedding?.length) return [];
  return lovedContexts
    .map((context) => ({ title: context.title, similarity: cosineSimilarity(embedding, context.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 2)
    .map((context) => context.title);
}

function explainModelCandidate(prediction: TastePrediction, nearest: string[], displayRankScore: number): string {
  const rankEstimate = displayRankScore.toFixed(1);
  const liked = prediction.topTraits.slice(0, 3).map((trait) => trait.label);

  if (nearest.length && liked.length) {
    return `Predicted ${rankEstimate}/10 for you - closest to ${nearest.join(" and ")}; what worked: ${liked.join(", ")}.`;
  }
  if (nearest.length) {
    return `Predicted ${rankEstimate}/10 for you - closest to ${nearest.join(" and ")}.`;
  }
  if (liked.length) {
    return `Predicted ${rankEstimate}/10 for you based on your taste for ${liked.join(", ")}.`;
  }
  return `Predicted ${rankEstimate}/10 for you from overall taste similarity and quality.`;
}

export function scoreCandidateWithModel(
  movie: Movie,
  model: TasteModel,
  embedding: number[] | null | undefined,
  exposedIds: Set<number>,
  lovedContexts: LovedContext[],
  calibrate?: ScoreCalibrator | null
): ScoredCandidate {
  const prediction = predictTasteScore(model, embedding, movie);
  const qScore = qualityScore(movie);
  const pScore = Math.min(1, Math.log10(Math.max(1, movie.popularity)) / 3);
  const noveltyScore = exposedIds.has(movie.tmdbId) ? -0.08 : 0.12;
  const softPenalty = candidateSoftPenalty(movie);
  const modelScore = prediction.score * MODEL_SCORE_WEIGHT;
  const score = modelScore + qScore * 0.75 + pScore * 0.15 + noveltyScore - softPenalty;
  const nearest = nearestLovedTitles(embedding, lovedContexts);
  const rawRankScore = predictedRankScore(prediction);
  const displayRankScore = calibrate ? calibrate(rawRankScore) : rawRankScore;

  const breakdown: RecommendationScoreBreakdown = {
    positiveTraitScore: Number(prediction.traitPositiveTotal.toFixed(4)),
    negativeTraitPenalty: Number(prediction.traitNegativeTotal.toFixed(4)),
    embeddingSimilarityScore: Number(prediction.embeddingScore.toFixed(4)),
    qualityScore: Number(qScore.toFixed(4)),
    popularityScore: Number(pScore.toFixed(4)),
    noveltyScore,
    diversityPenalty: 0,
    topTraits: prediction.topTraits.map((trait) => trait.label),
    avoidedTraits: prediction.avoidedTraits.map((trait) => trait.label),
    semanticScore: Number(modelScore.toFixed(4)),
    predictedRankScore: Number(displayRankScore.toFixed(2)),
    modelEmbeddingScore: Number(prediction.embeddingScore.toFixed(4)),
    modelTraitScore: Number(prediction.traitScore.toFixed(4)),
    clusterId: movie.genres[0]?.name ?? null,
    matchedTaxonomyTraits: prediction.topTraits
      .filter((trait) => !trait.key.startsWith("genre:") && !trait.key.startsWith("cast:") && !trait.key.startsWith("period:"))
      .map((trait) => trait.label),
    conflictedTaxonomyTraits: [],
    selectedTraitMatches: [],
    selectedTraitAvoidances: [],
    nearestPositiveMovies: nearest,
    nearestNegativeMovies: [],
    anchorScores: {}
  };

  return {
    movie,
    score,
    baselineScore: baselineScore(movie),
    breakdown,
    explanation: explainModelCandidate(prediction, nearest, displayRankScore)
  };
}

export async function generateRecommendations(store: MovieStore, profileId = DEFAULT_PROFILE_ID, limit = 10): Promise<RecommendationResult> {
  const startedAt = Date.now();
  const [movies, ratings, ratingReasons, ratingTraitReasons, exposures, appealSignals, watchlist, hidden] = await Promise.all([
    store.listMovies(),
    store.listRatings(profileId),
    store.listRatingReasons(profileId),
    store.listRatingTraitReasons(profileId),
    store.listExposures(profileId),
    store.listAppealSignals(profileId),
    store.listWatchlist(profileId),
    store.listHiddenRecommendations(profileId)
  ]);
  const readiness = recommendationReadiness(ratings);
  if (!readiness.ready) {
    return { ready: false, readiness, run: null, recommendations: [], fallback: false };
  }

  const ratedIds = new Set(ratings.map((rating) => rating.tmdbId));
  const hiddenIds = new Set(hidden);
  const notInterestedIds = new Set(
    appealSignals.filter((signal) => signal.signal === "not_interested").map((signal) => signal.tmdbId)
  );
  const exposedIds = new Set(exposures.filter((exposure) => exposure.source !== "not_seen").map((exposure) => exposure.tmdbId));
  const browseExposureIds = exposures
    .filter((exposure) => exposure.source !== "recommendation" && exposure.source !== "not_seen")
    .map((exposure) => exposure.tmdbId);
  const recommendationExposureIds = exposures
    .filter((exposure) => exposure.source === "recommendation")
    .map((exposure) => exposure.tmdbId);

  const candidates = movies.filter(
    (movie) =>
      candidateUsable(movie) && !ratedIds.has(movie.tmdbId) && !hiddenIds.has(movie.tmdbId) && !notInterestedIds.has(movie.tmdbId)
  );
  const excludedIds = Array.from(new Set([...ratedIds, ...hiddenIds, ...notInterestedIds]));

  // Embeddings for every movie the taste model trains on.
  let embeddingMatches: Awaited<ReturnType<MovieStore["matchMovieEmbeddings"]>> = [];
  let positiveAnchors: TasteAnchor[] = [];
  let negativeAnchor: TasteAnchor | null = null;
  let ratedContexts: RatedEmbeddingContext[] = [];

  const { model, signalEmbeddingsById } = await loadTasteModel(store, { movies, ratings, exposures, appealSignals, watchlist });

  // Candidate retrieval: the learned taste direction plus the user's top-loved movies.
  try {
    const queries: number[][] = [];
    if (model?.embeddingDirection) queries.push(model.embeddingDirection);
    const topLoved = [...ratings]
      .filter((rating) => (rating.rankScore ?? 0) >= VERDICT_BANDS.loved.min || POSITIVE_RATINGS.has(rating.rating))
      .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
      .slice(0, LOVED_ANCHOR_COUNT);
    for (const rating of topLoved) {
      const vector = signalEmbeddingsById.get(rating.tmdbId);
      if (vector?.length) queries.push(vector);
    }
    if (queries.length) {
      embeddingMatches = (
        await Promise.all(
          queries.map((query, index) =>
            store.matchMovieEmbeddings(query, index === 0 && model?.embeddingDirection ? ANCHOR_MATCH_COUNT : LOVED_ANCHOR_MATCH_COUNT, excludedIds)
          )
        )
      ).flat();
    }
  } catch (error) {
    console.warn("Embedding retrieval unavailable", error instanceof Error ? error.message : error);
  }

  const embeddingSimilarityById = new Map<number, number>();
  for (const match of embeddingMatches) {
    embeddingSimilarityById.set(match.tmdbId, Math.max(embeddingSimilarityById.get(match.tmdbId) ?? 0, match.similarity));
  }

  let fallback = false;
  let selected: ScoredCandidate[];

  try {
    const embeddingCandidateIds = new Set(embeddingMatches.map((match) => match.tmdbId));
    const candidatePool = (embeddingCandidateIds.size ? candidates.filter((movie) => embeddingCandidateIds.has(movie.tmdbId)) : candidates)
      .sort((a, b) => (embeddingSimilarityById.get(b.tmdbId) ?? 0) - (embeddingSimilarityById.get(a.tmdbId) ?? 0) || baselineScore(b) - baselineScore(a))
      .slice(0, MAX_CANDIDATE_POOL);
    const candidateEmbeddings = new Map(
      (await store.listMovieEmbeddings(candidatePool.map((movie) => movie.tmdbId))).map((embedding) => [embedding.tmdbId, embedding.embedding])
    );

    let scored: ScoredCandidate[];
    if (model) {
      const lovedContexts = lovedContextsFor(movies, ratings, signalEmbeddingsById);
      const movieById = new Map(movies.map((movie) => [movie.tmdbId, movie]));
      // Display calibration: map raw (shrunk) predictions onto the user's own
      // rank-score distribution so top picks read like their top ratings.
      let calibrator: ScoreCalibrator | null = null;
      try {
        calibrator = buildScoreCalibrator(
          model,
          ratings.flatMap((rating) => {
            const ratedMovie = movieById.get(rating.tmdbId);
            if (!ratedMovie || rating.rankScore == null) return [];
            return [{ movie: ratedMovie, embedding: signalEmbeddingsById.get(rating.tmdbId), actualRankScore: rating.rankScore }];
          })
        );
      } catch (error) {
        console.warn("Score calibration unavailable", error instanceof Error ? error.message : error);
      }
      scored = candidatePool.map((movie) =>
        scoreCandidateWithModel(movie, model!, candidateEmbeddings.get(movie.tmdbId), exposedIds, lovedContexts, calibrator)
      );
    } else {
      // Legacy anchor/profile scoring: cold-start path until enough graded history exists.
      const ratedEmbeddingList: MovieEmbedding[] = Array.from(signalEmbeddingsById.entries()).flatMap(([tmdbId, embedding]) =>
        embedding?.length ? [{ tmdbId, model: "", featureText: "", embedding }] : []
      );
      const anchors = buildTasteAnchors(movies, ratings, ratedEmbeddingList, exposures);
      positiveAnchors = anchors.positiveAnchors;
      negativeAnchor = anchors.negativeAnchor;
      ratedContexts = anchors.ratedContexts;
      const profile = buildTasteProfile(movies, ratings, exposures, ratingReasons, ratingTraitReasons);
      scored = candidatePool.map((movie) =>
        scoreMovieCandidate(movie, profile, exposedIds, {
          embeddingSimilarity: embeddingSimilarityById.get(movie.tmdbId) ?? 0,
          semantic: semanticContextForMovie(movie, candidateEmbeddings.get(movie.tmdbId), positiveAnchors, negativeAnchor, ratedContexts)
        })
      );
    }

    scored.sort((a, b) => b.score - a.score || b.baselineScore - a.baselineScore);
    selected = applyDiversity(scored, limit);
    if (!selected.length) throw new Error("No scored candidates available");
  } catch {
    fallback = true;
    selected = candidates
      .map((movie) => ({
        movie,
        score: baselineScore(movie),
        baselineScore: baselineScore(movie),
        breakdown: {
          positiveTraitScore: 0,
          negativeTraitPenalty: 0,
          embeddingSimilarityScore: embeddingSimilarityById.get(movie.tmdbId) ?? 0,
          semanticScore: embeddingSimilarityById.get(movie.tmdbId) ? Number(((embeddingSimilarityById.get(movie.tmdbId) ?? 0) * 5.5).toFixed(4)) : 0,
          positiveAnchorScore: 0,
          positiveMeanScore: 0,
          bestEverBonus: 0,
          negativeAnchorPenalty: 0,
          taxonomyPositiveScore: 0,
          taxonomyNegativePenalty: 0,
          qualityScore: qualityScore(movie),
          popularityScore: Math.min(1, Math.log10(Math.max(1, movie.popularity)) / 3),
          noveltyScore: exposedIds.has(movie.tmdbId) ? -0.08 : 0.12,
          diversityPenalty: 0,
          clusterId: null,
          topTraits: [],
          avoidedTraits: [],
          matchedTaxonomyTraits: [],
          conflictedTaxonomyTraits: [],
          selectedTraitMatches: [],
          selectedTraitAvoidances: [],
          nearestPositiveMovies: [],
          nearestNegativeMovies: [],
          anchorScores: {}
        },
        explanation: "Fallback pick from weighted popular and top-rated movies because taste scoring was unavailable."
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  const run = await store.saveRecommendationRun(
    {
      status: fallback ? "fallback" : "ready",
      promptVersion: PROMPT_VERSION,
      scoringVersion: model ? SCORING_VERSION : `${SCORING_VERSION}-legacy-coldstart`,
      baselineAverage: averageRatedScoreForSource(ratings, browseExposureIds),
      recommendationAverage: averageRatedScoreForSource(ratings, recommendationExposureIds),
      metadata: {
        candidateCount: candidates.length,
        ratedCount: ratings.length,
        positiveCount: readiness.positives,
        appealSignalCount: appealSignals.length,
        notInterestedCount: notInterestedIds.size,
        modelReady: Boolean(model),
        modelLambda: model?.lambda ?? null,
        modelGcv: model ? Number(model.gcv.toFixed(5)) : null,
        modelSampleCount: model?.sampleCount ?? 0,
        modelRatingSampleCount: model?.ratingSampleCount ?? 0,
        modelTraitVocabSize: model?.traitVocab.length ?? 0,
        embeddingMatchCount: embeddingMatches.length,
        candidatePoolLimit: MAX_CANDIDATE_POOL,
        taxonomyVersion: TAXONOMY_VERSION,
        featureTextVersion: FEATURE_TEXT_VERSION,
        ratingReasonCount: ratingReasons.length,
        ratingTraitReasonCount: ratingTraitReasons.length,
        totalDurationMs: Date.now() - startedAt,
        fallback
      },
      items: selected.map((candidate, index) => ({
        tmdbId: candidate.movie.tmdbId,
        movie: candidate.movie,
        rank: index + 1,
        score: Number(candidate.score.toFixed(4)),
        baselineScore: Number(candidate.baselineScore.toFixed(4)),
        scoreBreakdown: candidate.breakdown,
        explanation: candidate.explanation
      }))
    },
    profileId
  );

  for (const item of run.items) {
    await store.logExposure(item.tmdbId, "recommendation", run.id, profileId);
  }

  return { ready: true, readiness, run, recommendations: run.items, fallback };
}
