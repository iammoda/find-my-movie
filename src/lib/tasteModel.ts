import { TASTE_KIND_MULTIPLIERS } from "@/lib/constants";
import { seedFromLegacyRating } from "@/lib/ranking";
import { deriveTasteFacts, factKey } from "@/lib/taste";
import { taxonomyLabelFor } from "@/lib/taxonomy";
import type { AppealSignal, Movie, MovieExposure, Rating, WatchlistItem } from "@/lib/types";

/**
 * Learned discriminative taste model.
 *
 * Instead of hand-tuned trait counting, we fit a regularized linear model over
 * [movie embedding | trait one-hots] with the user's continuous rank scores as
 * targets. Whatever consistently separates high-ranked from low-ranked movies
 * gets weight; traits shared by likes and dislikes wash out to ~0 automatically.
 *
 * The weighted ridge problem is solved exactly in the dual (kernel) space:
 * alpha = (X X^T + lambda I)^-1 y, w = X^T alpha - an n x n solve for n rated
 * movies, which is milliseconds for n <= ~600. Lambda is chosen per fit by
 * generalized cross-validation, so regularization adapts as history grows.
 */

export const TASTE_MODEL_VERSION = "learned-rank-v1";

const LAMBDA_GRID = [8, 20, 50, 120, 300];
const TRAIT_SCALE = 0.5;
const MAX_TRAIT_VOCAB = 800;
const MIN_TRAIT_DOCUMENT_FREQUENCY = 2;
const MIN_RATING_SAMPLES = 15;
const MIN_POSITIVE_SAMPLES = 3;
const MIN_NEGATIVE_SAMPLES = 3;
const MAX_AUXILIARY_SAMPLES = 250;

export interface TasteSample {
  tmdbId: number;
  /** Target in [-1, 1]: (rankScore - 5) / 5. */
  y: number;
  /** Sample confidence weight. */
  weight: number;
  embedding: number[] | null;
  traits: Array<{ key: string; value: number }>;
  kind: "rating" | "appeal" | "impression";
}

export interface TasteModel {
  version: string;
  embeddingDim: number;
  traitVocab: string[];
  traitIndex: Map<string, number>;
  /** Primal weights: [0, embeddingDim) embedding block, then trait block. */
  weights: Float64Array;
  bias: number;
  lambda: number;
  gcv: number;
  sampleCount: number;
  ratingSampleCount: number;
  /** Normalized embedding-block weights; the learned taste direction for retrieval. */
  embeddingDirection: number[] | null;
}

export interface TastePrediction {
  score: number;
  embeddingScore: number;
  traitScore: number;
  traitPositiveTotal: number;
  traitNegativeTotal: number;
  topTraits: Array<{ key: string; label: string; contribution: number }>;
  avoidedTraits: Array<{ key: string; label: string; contribution: number }>;
}

export function traitLabelForKey(key: string): string {
  const separator = key.indexOf(":");
  const kind = separator === -1 ? "" : key.slice(0, separator);
  const value = separator === -1 ? key : key.slice(separator + 1);
  if (kind === "genre" || kind === "period" || kind === "setting" || kind === "cast" || kind === "director") {
    return `${kind}:${value}`;
  }
  return taxonomyLabelFor(value);
}

/** Diagnostic/ops switch: when set, LLM-sourced facts are excluded from the model's trait features. */
const EXCLUDE_LLM_FACTS = process.env.TASTE_EXCLUDE_LLM === "1";

function traitFeaturesFor(movie: Movie): Array<{ key: string; value: number }> {
  const byKey = new Map<string, number>();
  for (const fact of deriveTasteFacts(movie)) {
    if (EXCLUDE_LLM_FACTS && fact.source === "llm") continue;
    const key = factKey(fact);
    const value = fact.weight * (TASTE_KIND_MULTIPLIERS[fact.kind] ?? 1);
    byKey.set(key, Math.max(byKey.get(key) ?? 0, value));
  }
  return [...byKey.entries()].map(([key, value]) => ({ key, value }));
}

function latestExposureFor(tmdbId: number, exposures: MovieExposure[], before?: string): MovieExposure | null {
  let latest: MovieExposure | null = null;
  for (const exposure of exposures) {
    if (exposure.tmdbId !== tmdbId || exposure.source === "not_seen") continue;
    if (before && exposure.createdAt > before) continue;
    if (!latest || exposure.createdAt > latest.createdAt) latest = exposure;
  }
  return latest;
}

function ratingSampleWeight(rating: Rating, y: number, exposure: MovieExposure | null): number {
  let weight = 1;
  if (rating.verdict === "fine") weight *= 0.6;

  const source = exposure?.source ?? null;
  if (source === "manual_search") weight *= 1.35;
  else if (source === "recommendation") weight *= 1.05;
  else if (source === "top_rated" && y > 0) weight *= 0.6; // liking an acclaimed film is weak evidence
  else if (source === "popular" && y > 0) weight *= 0.8;

  // Passive behavior: decisive verdicts and inspected cards carry a bit more signal.
  if (exposure?.decisionMs != null && exposure.decisionMs > 0 && exposure.decisionMs < 1500) weight *= 1.1;
  if (exposure?.flipped) weight *= 1.05;

  return weight;
}

export function buildTasteSamples(
  movies: Movie[],
  ratings: Rating[],
  exposures: MovieExposure[] = [],
  appealSignals: AppealSignal[] = [],
  embeddingsById: Map<number, number[]> = new Map(),
  watchlist: WatchlistItem[] = []
): TasteSample[] {
  const movieById = new Map(movies.map((movie) => [movie.tmdbId, movie]));
  const ratedIds = new Set(ratings.map((rating) => rating.tmdbId));
  const samples: TasteSample[] = [];

  for (const rating of ratings) {
    const movie = movieById.get(rating.tmdbId);
    if (!movie) continue;
    const rankScore = rating.rankScore ?? seedFromLegacyRating(rating.rating)?.rankScore;
    if (rankScore == null) continue;

    const y = (rankScore - 5) / 5;
    const exposure = latestExposureFor(rating.tmdbId, exposures, rating.updatedAt);
    samples.push({
      tmdbId: rating.tmdbId,
      y,
      weight: ratingSampleWeight(rating, y, exposure),
      embedding: embeddingsById.get(rating.tmdbId) ?? null,
      traits: traitFeaturesFor(movie),
      kind: "rating"
    });
  }

  let auxiliaryCount = 0;

  for (const signal of appealSignals) {
    if (auxiliaryCount >= MAX_AUXILIARY_SAMPLES) break;
    if (ratedIds.has(signal.tmdbId)) continue;
    const movie = movieById.get(signal.tmdbId);
    if (!movie) continue;
    const negative = signal.signal === "not_interested";
    samples.push({
      tmdbId: signal.tmdbId,
      y: negative ? -0.35 : 0.25,
      weight: negative ? 0.25 : 0.15,
      embedding: embeddingsById.get(signal.tmdbId) ?? null,
      traits: traitFeaturesFor(movie),
      kind: "appeal"
    });
    auxiliaryCount += 1;
  }

  // Abandoned watchlist items ("added it, didn't finish") = weak negative outcome signal.
  const abandonedIds = new Set(watchlist.filter((item) => item.status === "abandoned").map((item) => item.tmdbId));
  for (const tmdbId of abandonedIds) {
    if (auxiliaryCount >= MAX_AUXILIARY_SAMPLES) break;
    if (ratedIds.has(tmdbId)) continue;
    const movie = movieById.get(tmdbId);
    if (!movie) continue;
    samples.push({
      tmdbId,
      y: -0.3,
      weight: 0.3,
      embedding: embeddingsById.get(tmdbId) ?? null,
      traits: traitFeaturesFor(movie),
      kind: "appeal"
    });
    auxiliaryCount += 1;
  }

  // Repeatedly shown but never acted on -> soft negative (impression discounting).
  const appealIds = new Set(appealSignals.map((signal) => signal.tmdbId));
  const impressionCounts = new Map<number, number>();
  for (const exposure of exposures) {
    if (exposure.source === "not_seen") continue;
    impressionCounts.set(exposure.tmdbId, (impressionCounts.get(exposure.tmdbId) ?? 0) + 1);
  }
  for (const [tmdbId, count] of impressionCounts) {
    if (auxiliaryCount >= MAX_AUXILIARY_SAMPLES) break;
    if (count < 3 || ratedIds.has(tmdbId) || appealIds.has(tmdbId)) continue;
    const movie = movieById.get(tmdbId);
    if (!movie) continue;
    samples.push({
      tmdbId,
      y: -0.2,
      weight: Math.min(0.3, 0.08 * count),
      embedding: embeddingsById.get(tmdbId) ?? null,
      traits: traitFeaturesFor(movie),
      kind: "impression"
    });
    auxiliaryCount += 1;
  }

  return samples;
}

function buildTraitVocab(samples: TasteSample[]): string[] {
  const documentFrequency = new Map<string, number>();
  for (const sample of samples) {
    if (sample.kind !== "rating") continue;
    for (const trait of sample.traits) {
      documentFrequency.set(trait.key, (documentFrequency.get(trait.key) ?? 0) + 1);
    }
  }
  return [...documentFrequency.entries()]
    .filter(([, df]) => df >= MIN_TRAIT_DOCUMENT_FREQUENCY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TRAIT_VOCAB)
    .map(([key]) => key);
}

/** Cholesky factorization of a symmetric positive-definite matrix (in place, lower triangle). */
function cholesky(matrix: Float64Array, n: number): boolean {
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i * n + j];
      for (let k = 0; k < j; k += 1) sum -= matrix[i * n + k] * matrix[j * n + k];
      if (i === j) {
        if (sum <= 0) return false;
        matrix[i * n + i] = Math.sqrt(sum);
      } else {
        matrix[i * n + j] = sum / matrix[j * n + j];
      }
    }
  }
  return true;
}

function choleskySolve(factor: Float64Array, n: number, rhs: Float64Array): Float64Array {
  const solution = Float64Array.from(rhs);
  for (let i = 0; i < n; i += 1) {
    let sum = solution[i];
    for (let k = 0; k < i; k += 1) sum -= factor[i * n + k] * solution[k];
    solution[i] = sum / factor[i * n + i];
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = solution[i];
    for (let k = i + 1; k < n; k += 1) sum -= factor[k * n + i] * solution[k];
    solution[i] = sum / factor[i * n + i];
  }
  return solution;
}

/** diag((K + lambda I)^-1) via n unit-vector solves against the Cholesky factor. */
function inverseDiagonal(factor: Float64Array, n: number): Float64Array {
  const diagonal = new Float64Array(n);
  const unit = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    unit.fill(0);
    unit[i] = 1;
    diagonal[i] = choleskySolve(factor, n, unit)[i];
  }
  return diagonal;
}

export function fitTasteModel(samples: TasteSample[]): TasteModel | null {
  const ratingSamples = samples.filter((sample) => sample.kind === "rating");
  if (ratingSamples.length < MIN_RATING_SAMPLES) return null;
  if (ratingSamples.filter((sample) => sample.y > 0.1).length < MIN_POSITIVE_SAMPLES) return null;
  if (ratingSamples.filter((sample) => sample.y < -0.1).length < MIN_NEGATIVE_SAMPLES) return null;

  const embeddingDim = samples.find((sample) => sample.embedding?.length)?.embedding?.length ?? 0;
  const traitVocab = buildTraitVocab(samples);
  const traitIndex = new Map(traitVocab.map((key, index) => [key, index]));
  const dim = embeddingDim + traitVocab.length;
  if (!dim) return null;

  const usable = samples.filter((sample) => sample.embedding?.length || sample.traits.some((trait) => traitIndex.has(trait.key)));
  const n = usable.length;
  if (n < MIN_RATING_SAMPLES) return null;

  // Row-scaled design matrix: x~ = sqrt(w) x, y~ = sqrt(w) (y - weighted mean).
  const totalWeight = usable.reduce((sum, sample) => sum + sample.weight, 0);
  const bias = usable.reduce((sum, sample) => sum + sample.y * sample.weight, 0) / Math.max(1e-9, totalWeight);

  const rows: Float64Array[] = [];
  const targets = new Float64Array(n);
  for (let index = 0; index < n; index += 1) {
    const sample = usable[index];
    const sqrtWeight = Math.sqrt(sample.weight);
    const row = new Float64Array(dim);
    if (sample.embedding?.length) {
      const limit = Math.min(embeddingDim, sample.embedding.length);
      for (let d = 0; d < limit; d += 1) row[d] = sample.embedding[d] * sqrtWeight;
    }
    for (const trait of sample.traits) {
      const traitPosition = traitIndex.get(trait.key);
      if (traitPosition != null) row[embeddingDim + traitPosition] = trait.value * TRAIT_SCALE * sqrtWeight;
    }
    rows.push(row);
    targets[index] = (sample.y - bias) * sqrtWeight;
  }

  // Gram matrix K = X X^T.
  const gram = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let dot = 0;
      const a = rows[i];
      const b = rows[j];
      for (let d = 0; d < dim; d += 1) dot += a[d] * b[d];
      gram[i * n + j] = dot;
      gram[j * n + i] = dot;
    }
  }

  // Pick lambda by generalized cross-validation: h_ii = 1 - lambda * diag((K+lambda I)^-1).
  let best: { lambda: number; gcv: number; alpha: Float64Array } | null = null;
  for (const lambda of LAMBDA_GRID) {
    const regularized = Float64Array.from(gram);
    for (let i = 0; i < n; i += 1) regularized[i * n + i] += lambda;
    if (!cholesky(regularized, n)) continue;

    const alpha = choleskySolve(regularized, n, targets);
    const invDiagonal = inverseDiagonal(regularized, n);

    let gcv = 0;
    for (let i = 0; i < n; i += 1) {
      // residual_i = y~_i - (K alpha)_i = lambda * alpha_i for ridge in the dual.
      const residual = lambda * alpha[i];
      const denominator = Math.max(1e-6, lambda * invDiagonal[i]);
      const looResidual = residual / denominator;
      gcv += looResidual * looResidual;
    }
    gcv /= n;

    if (!best || gcv < best.gcv) best = { lambda, gcv, alpha };
  }
  if (!best) return null;

  // Primal weights: w = X^T alpha.
  const weights = new Float64Array(dim);
  for (let i = 0; i < n; i += 1) {
    const alphaValue = best.alpha[i];
    if (!alphaValue) continue;
    const row = rows[i];
    for (let d = 0; d < dim; d += 1) weights[d] += row[d] * alphaValue;
  }

  let embeddingDirection: number[] | null = null;
  if (embeddingDim) {
    let magnitude = 0;
    for (let d = 0; d < embeddingDim; d += 1) magnitude += weights[d] * weights[d];
    magnitude = Math.sqrt(magnitude);
    if (magnitude > 1e-9) {
      embeddingDirection = Array.from(weights.subarray(0, embeddingDim), (value) => value / magnitude);
    }
  }

  return {
    version: TASTE_MODEL_VERSION,
    embeddingDim,
    traitVocab,
    traitIndex,
    weights,
    bias,
    lambda: best.lambda,
    gcv: best.gcv,
    sampleCount: n,
    ratingSampleCount: ratingSamples.length,
    embeddingDirection
  };
}

export function predictTasteScore(model: TasteModel, embedding: number[] | null | undefined, movie: Movie): TastePrediction {
  let embeddingScore = 0;
  if (embedding?.length && model.embeddingDim) {
    const limit = Math.min(model.embeddingDim, embedding.length);
    for (let d = 0; d < limit; d += 1) embeddingScore += model.weights[d] * embedding[d];
  }

  let traitScore = 0;
  let traitPositiveTotal = 0;
  let traitNegativeTotal = 0;
  const contributions: Array<{ key: string; label: string; contribution: number }> = [];
  for (const trait of traitFeaturesFor(movie)) {
    const traitPosition = model.traitIndex.get(trait.key);
    if (traitPosition == null) continue;
    const contribution = model.weights[model.embeddingDim + traitPosition] * trait.value * TRAIT_SCALE;
    if (!contribution) continue;
    traitScore += contribution;
    if (contribution > 0) traitPositiveTotal += contribution;
    else traitNegativeTotal += Math.abs(contribution);
    contributions.push({ key: trait.key, label: traitLabelForKey(trait.key), contribution });
  }

  contributions.sort((a, b) => b.contribution - a.contribution);
  const topTraits = contributions.filter((item) => item.contribution > 0).slice(0, 6);
  const avoidedTraits = contributions
    .filter((item) => item.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 4);

  return {
    score: model.bias + embeddingScore + traitScore,
    embeddingScore,
    traitScore,
    traitPositiveTotal,
    traitNegativeTotal,
    topTraits,
    avoidedTraits
  };
}

/** Predicted rank score on the user's 0-10 scale. */
export function predictedRankScore(prediction: TastePrediction): number {
  return Math.max(0, Math.min(10, prediction.score * 5 + 5));
}

const MAX_UNCERTAINTY_ANCHORS = 64;

/**
 * Cheap GP-style predictive-uncertainty proxy: posterior variance is low near
 * training points and high far from all of them, so we estimate uncertainty as
 * 1 - max cosine similarity to the rated-movie embeddings. Exact dual-form
 * variance (k(x)^T (K+lambda I)^-1 k(x)) needs the full training design at
 * predict time - hundreds of times the cost per candidate - while this proxy
 * preserves the property active learning needs: rating a movie collapses the
 * uncertainty of everything similar to it.
 */
export function buildUncertaintyEstimator(anchorEmbeddings: number[][]): (embedding: number[] | null | undefined) => number {
  const anchors: Array<{ vector: number[]; norm: number }> = [];
  for (const vector of anchorEmbeddings.slice(0, MAX_UNCERTAINTY_ANCHORS)) {
    if (!vector?.length) continue;
    let norm = 0;
    for (const value of vector) norm += value * value;
    norm = Math.sqrt(norm);
    if (norm > 1e-9) anchors.push({ vector, norm });
  }

  return (embedding: number[] | null | undefined) => {
    if (!embedding?.length || !anchors.length) return 1;
    let embeddingNorm = 0;
    for (const value of embedding) embeddingNorm += value * value;
    embeddingNorm = Math.sqrt(embeddingNorm);
    if (embeddingNorm < 1e-9) return 1;

    let maxSimilarity = 0;
    for (const anchor of anchors) {
      const limit = Math.min(anchor.vector.length, embedding.length);
      let dot = 0;
      for (let d = 0; d < limit; d += 1) dot += anchor.vector[d] * embedding[d];
      const similarity = dot / (anchor.norm * embeddingNorm);
      if (similarity > maxSimilarity) maxSimilarity = similarity;
    }
    return Math.max(0, Math.min(1, 1 - maxSimilarity));
  };
}

export type ScoreCalibrator = (rawRankScore: number) => number;

const MIN_CALIBRATION_SAMPLES = 20;

/**
 * Quantile calibration for display: ridge shrinkage compresses raw predictions
 * into a narrow band (a raw 7.6 can be the model's ceiling), which reads as
 * timid scores. Map a raw prediction to its percentile among the model's own
 * predictions on the user's rated movies, then return the user's actual rank
 * score at that percentile - "top of the model's range" displays like the top
 * of the user's own scale. Monotone by construction; ranking stays raw.
 */
export function buildScoreCalibrator(
  model: TasteModel,
  ratedSamples: Array<{ movie: Movie; embedding: number[] | null | undefined; actualRankScore: number }>
): ScoreCalibrator | null {
  if (ratedSamples.length < MIN_CALIBRATION_SAMPLES) return null;

  const raws: number[] = [];
  const actuals: number[] = [];
  for (const sample of ratedSamples) {
    raws.push(predictedRankScore(predictTasteScore(model, sample.embedding, sample.movie)));
    actuals.push(Math.max(0, Math.min(10, sample.actualRankScore)));
  }
  raws.sort((a, b) => a - b);
  actuals.sort((a, b) => a - b);

  return (rawRankScore: number) => {
    // Percentile of the raw prediction among training predictions.
    let low = 0;
    let high = raws.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (raws[mid] <= rawRankScore) low = mid + 1;
      else high = mid;
    }
    const percentile = raws.length ? low / raws.length : 0.5;

    // The user's actual rank score at that percentile (linear interpolation).
    const position = percentile * (actuals.length - 1);
    const lower = Math.max(0, Math.min(actuals.length - 1, Math.floor(position)));
    const upper = Math.max(0, Math.min(actuals.length - 1, Math.ceil(position)));
    const fraction = position - Math.floor(position);
    const value = actuals[lower] * (1 - fraction) + actuals[upper] * fraction;
    return Math.max(0, Math.min(10, value));
  };
}

export interface TasteModelSignals {
  movies: Movie[];
  ratings: Rating[];
  exposures: MovieExposure[];
  appealSignals: AppealSignal[];
  watchlist: WatchlistItem[];
}

export interface LoadedTasteModel {
  model: TasteModel | null;
  /** Embeddings for every movie the model trains on, keyed by tmdbId. */
  signalEmbeddingsById: Map<number, number[]>;
}

/**
 * Fetch signal embeddings and fit the taste model from a store's data.
 * Shared by recommendations and the taste-test deck; never throws - callers
 * get `model: null` (cold start / embeddings unavailable) and fall back.
 *
 * Fits are memoized briefly and keyed by the rating/appeal/watchlist state, so
 * same-page-load consumers share one fit while any new verdict forces a refit.
 */
let loadedModelCache: { key: string; expiresAt: number; value: LoadedTasteModel } | null = null;
const LOADED_MODEL_TTL_MS = 60_000;

// Embeddings are immutable per movie; keep them across refits so a new rating
// only fetches the vectors it does not already have. Empty arrays mark movies
// known to lack an embedding.
const signalEmbeddingCache = new Map<number, number[]>();
const SIGNAL_EMBEDDING_CACHE_MAX = 5000;

function tasteModelCacheKey(signals: TasteModelSignals): string {
  let latestRating = "";
  for (const rating of signals.ratings) {
    if (rating.updatedAt > latestRating) latestRating = rating.updatedAt;
  }
  // Profile id must be part of the key: a warm server serves multiple users.
  const profileId = signals.ratings[0]?.profileId ?? "anon";
  // Movies-scope fingerprint: how many rated movies the caller's catalog can
  // actually resolve. A fit against a partial catalog (e.g. one media type)
  // must never be served to a caller with the full signal set.
  const movieIds = new Set(signals.movies.map((movie) => movie.tmdbId));
  const resolvableRatings = signals.ratings.reduce((count, rating) => count + (movieIds.has(rating.tmdbId) ? 1 : 0), 0);
  return [profileId, signals.ratings.length, resolvableRatings, latestRating, signals.appealSignals.length, signals.watchlist.length].join(
    "|"
  );
}

export async function loadTasteModel(
  store: { listMovieEmbeddings(tmdbIds?: number[]): Promise<Array<{ tmdbId: number; embedding: number[] }>> },
  signals: TasteModelSignals
): Promise<LoadedTasteModel> {
  const cacheKey = tasteModelCacheKey(signals);
  if (loadedModelCache && loadedModelCache.key === cacheKey && loadedModelCache.expiresAt > Date.now()) {
    return loadedModelCache.value;
  }

  const signalIds = Array.from(
    new Set([
      ...signals.ratings.map((rating) => rating.tmdbId),
      ...signals.appealSignals.map((signal) => signal.tmdbId),
      ...signals.watchlist.filter((item) => item.status === "abandoned").map((item) => item.tmdbId)
    ])
  );

  const signalEmbeddingsById = new Map<number, number[]>();
  const missing: number[] = [];
  for (const tmdbId of signalIds) {
    const cached = signalEmbeddingCache.get(tmdbId);
    if (cached === undefined) missing.push(tmdbId);
    else if (cached.length) signalEmbeddingsById.set(tmdbId, cached);
  }
  if (missing.length) {
    try {
      const fetched = await store.listMovieEmbeddings(missing);
      if (signalEmbeddingCache.size + missing.length > SIGNAL_EMBEDDING_CACHE_MAX) signalEmbeddingCache.clear();
      const fetchedIds = new Set<number>();
      for (const embedding of fetched) {
        fetchedIds.add(embedding.tmdbId);
        signalEmbeddingCache.set(embedding.tmdbId, embedding.embedding);
        if (embedding.embedding.length) signalEmbeddingsById.set(embedding.tmdbId, embedding.embedding);
      }
      for (const tmdbId of missing) {
        if (!fetchedIds.has(tmdbId)) signalEmbeddingCache.set(tmdbId, []);
      }
    } catch (error) {
      console.warn("Signal embeddings unavailable", error instanceof Error ? error.message : error);
    }
  }

  let model: TasteModel | null = null;
  try {
    model = fitTasteModel(
      buildTasteSamples(signals.movies, signals.ratings, signals.exposures, signals.appealSignals, signalEmbeddingsById, signals.watchlist)
    );
  } catch (error) {
    console.warn("Taste model fit failed", error instanceof Error ? error.message : error);
  }

  const value = { model, signalEmbeddingsById };
  loadedModelCache = { key: cacheKey, expiresAt: Date.now() + LOADED_MODEL_TTL_MS, value };
  return value;
}
