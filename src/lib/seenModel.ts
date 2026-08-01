import { mainstreamScore } from "@/lib/quality";
import type { AppealSignal, Movie, MovieExposure, Rating } from "@/lib/types";

/**
 * P(seen): the probability this user has seen (or at least knows) a movie.
 *
 * Every swipe is a free label - rating a movie proves they saw it, "haven't
 * seen" / swiping a card away proves they did not - so we fit a small
 * L2-regularized logistic regression per user at deck-build time:
 *
 *   P(seen | x) = sigmoid(theta^T x)
 *
 * over cheap familiarity features (log votes, log popularity, release era,
 * genres, decade). Fitting uses IRLS (Newton) on at most a few thousand rows
 * and ~35 features: milliseconds. With little history the logistic estimate is
 * blended toward the same mainstream-reach heuristic the deck used before, so
 * cold-start behavior is unchanged and no user input is ever required.
 */

const L2_LAMBDA = 1.0;
const IRLS_ITERATIONS = 12;
const MIN_PROBABILITY = 0.02;
const MAX_PROBABILITY = 0.98;
/** Below this many labels the logistic fit is skipped entirely. */
const MIN_LABELS = 12;
const MIN_LABELS_PER_CLASS = 4;
/** Labels needed before the logistic estimate fully replaces the heuristic. */
const FULL_CONFIDENCE_LABELS = 120;

function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Sparse feature vector as (key, value) pairs; vocab is built from the labeled set. */
function featurePairs(movie: Movie): Array<[string, number]> {
  const pairs: Array<[string, number]> = [["bias", 1]];
  pairs.push(["votes", Math.min(1.5, Math.log10(1 + Math.max(0, movie.voteCount)) / 4)]);
  // Linear vote reach: the log scale compresses exactly the mid-popular band
  // (5k vs 10k votes) where real users' seen/not-seen boundary lives.
  pairs.push(["votesLinear", Math.min(2, Math.max(0, movie.voteCount) / 10000)]);
  pairs.push(["popularity", Math.min(1.5, Math.log10(1 + Math.max(0, movie.popularity)) / 3)]);

  const year = movie.releaseDate ? Number(movie.releaseDate.slice(0, 4)) : NaN;
  if (Number.isFinite(year)) {
    pairs.push(["year", Math.max(0, Math.min(1.2, (year - 1950) / 80))]);
    pairs.push([`decade:${Math.floor(year / 10) * 10}`, 1]);
  } else {
    pairs.push(["year", 0.5]);
  }

  for (const genre of movie.genres.slice(0, 3)) pairs.push([`genre:${genre.name}`, 1]);
  return pairs;
}

/** Solve the symmetric positive-definite system A x = b in place (Gaussian elimination). */
function solveSymmetric(matrix: Float64Array, rhs: Float64Array, n: number): Float64Array | null {
  const a = Float64Array.from(matrix);
  const b = Float64Array.from(rhs);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row * n + col]) > Math.abs(a[pivotRow * n + col])) pivotRow = row;
    }
    const pivot = a[pivotRow * n + col];
    if (!Number.isFinite(pivot) || Math.abs(pivot) < 1e-10) return null;
    if (pivotRow !== col) {
      for (let k = 0; k < n; k += 1) {
        const tmp = a[col * n + k];
        a[col * n + k] = a[pivotRow * n + k];
        a[pivotRow * n + k] = tmp;
      }
      const tmp = b[col];
      b[col] = b[pivotRow];
      b[pivotRow] = tmp;
    }
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row * n + col] / a[col * n + col];
      if (!factor) continue;
      for (let k = col; k < n; k += 1) a[row * n + k] -= factor * a[col * n + k];
      b[row] -= factor * b[col];
    }
  }
  const solution = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let k = row + 1; k < n; k += 1) sum -= a[row * n + k] * solution[k];
    solution[row] = sum / a[row * n + row];
  }
  return solution;
}

interface LabeledMovie {
  movie: Movie;
  seen: boolean;
}

function collectLabels(
  ratings: Rating[],
  exposures: MovieExposure[],
  appealSignals: AppealSignal[],
  byId: Map<number, Movie>
): LabeledMovie[] {
  const seenIds = new Set(ratings.map((rating) => rating.tmdbId));
  const unseenIds = new Set<number>();
  for (const exposure of exposures) {
    if (exposure.source === "not_seen" && !seenIds.has(exposure.tmdbId)) unseenIds.add(exposure.tmdbId);
  }
  // Swiping a card away (want to watch / pass) implies they had not seen it.
  for (const signal of appealSignals) {
    if (!seenIds.has(signal.tmdbId)) unseenIds.add(signal.tmdbId);
  }

  const labels: LabeledMovie[] = [];
  for (const tmdbId of seenIds) {
    const movie = byId.get(tmdbId);
    if (movie) labels.push({ movie, seen: true });
  }
  for (const tmdbId of unseenIds) {
    const movie = byId.get(tmdbId);
    if (movie) labels.push({ movie, seen: false });
  }
  return labels;
}

function fitLogistic(labels: LabeledMovie[]): ((movie: Movie) => number) | null {
  const seenCount = labels.filter((label) => label.seen).length;
  const unseenCount = labels.length - seenCount;
  if (labels.length < MIN_LABELS || seenCount < MIN_LABELS_PER_CLASS || unseenCount < MIN_LABELS_PER_CLASS) return null;

  // Feature vocab from the labeled set only; unseen-at-predict keys are dropped.
  const vocab = new Map<string, number>();
  const sparseRows: Array<Array<[number, number]>> = [];
  for (const label of labels) {
    const row: Array<[number, number]> = [];
    for (const [key, value] of featurePairs(label.movie)) {
      let index = vocab.get(key);
      if (index === undefined) {
        index = vocab.size;
        vocab.set(key, index);
      }
      row.push([index, value]);
    }
    sparseRows.push(row);
  }

  const dim = vocab.size;
  const n = sparseRows.length;
  const biasIndex = vocab.get("bias") ?? 0;

  // Standardize features (except the bias column): the discriminative range of
  // e.g. log-votes is narrow, and without unit variance the L2 penalty mutes
  // exactly the features that separate seen from not-seen.
  const dense = new Float64Array(n * dim);
  for (let i = 0; i < n; i += 1) {
    for (const [index, value] of sparseRows[i]) dense[i * dim + index] = value;
  }
  const mean = new Float64Array(dim);
  const std = new Float64Array(dim);
  for (let d = 0; d < dim; d += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += dense[i * dim + d];
    mean[d] = sum / n;
    let variance = 0;
    for (let i = 0; i < n; i += 1) {
      const delta = dense[i * dim + d] - mean[d];
      variance += delta * delta;
    }
    std[d] = Math.sqrt(variance / n);
  }
  mean[biasIndex] = 0;
  std[biasIndex] = 1;
  for (let d = 0; d < dim; d += 1) {
    if (std[d] < 1e-9) std[d] = 1; // constant feature: leave centered at 0
  }
  for (let i = 0; i < n; i += 1) {
    for (let d = 0; d < dim; d += 1) dense[i * dim + d] = (dense[i * dim + d] - mean[d]) / std[d];
  }

  const theta = new Float64Array(dim);
  const targets = labels.map((label) => (label.seen ? 1 : 0));

  // IRLS: theta <- theta + (X^T W X + lambda I)^-1 (X^T (y - p) - lambda theta)
  for (let iteration = 0; iteration < IRLS_ITERATIONS; iteration += 1) {
    const hessian = new Float64Array(dim * dim);
    const gradient = new Float64Array(dim);
    for (let i = 0; i < n; i += 1) {
      let z = 0;
      for (let d = 0; d < dim; d += 1) z += theta[d] * dense[i * dim + d];
      const p = sigmoid(z);
      const w = Math.max(1e-6, p * (1 - p));
      const residual = targets[i] - p;
      for (let a = 0; a < dim; a += 1) {
        const aValue = dense[i * dim + a];
        if (!aValue) continue;
        gradient[a] += residual * aValue;
        for (let b = 0; b < dim; b += 1) {
          hessian[a * dim + b] += w * aValue * dense[i * dim + b];
        }
      }
    }
    for (let d = 0; d < dim; d += 1) {
      const lambda = d === biasIndex ? 1e-4 : L2_LAMBDA; // leave the intercept effectively unpenalized
      hessian[d * dim + d] += lambda;
      gradient[d] -= lambda * theta[d];
    }
    const step = solveSymmetric(hessian, gradient, dim);
    if (!step) return null;
    let maxStep = 0;
    for (let d = 0; d < dim; d += 1) {
      theta[d] += step[d];
      maxStep = Math.max(maxStep, Math.abs(step[d]));
    }
    if (maxStep < 1e-6) break;
  }

  return (movie: Movie) => {
    let z = 0;
    const values = new Float64Array(dim);
    for (const [key, value] of featurePairs(movie)) {
      const index = vocab.get(key);
      if (index !== undefined) values[index] = value;
    }
    for (let d = 0; d < dim; d += 1) z += theta[d] * ((values[d] - mean[d]) / std[d]);
    return Math.max(MIN_PROBABILITY, Math.min(MAX_PROBABILITY, sigmoid(z)));
  };
}

/**
 * Heuristic fallback prior (the deck's original behavior): mainstream reach
 * blended with per-decade/genre seen rates from the user's history. Kept both
 * as the cold-start path and as a stabilizer the logistic estimate is blended
 * with while labels are still sparse.
 */
export function buildSeenPrior(
  ratings: Rating[],
  exposures: MovieExposure[],
  appealSignals: AppealSignal[],
  byId: Map<number, Movie>
): (movie: Movie) => number {
  const seenIds = new Set(ratings.map((rating) => rating.tmdbId));
  const unseenIds = new Set<number>();
  for (const exposure of exposures) {
    if (exposure.source === "not_seen" && !seenIds.has(exposure.tmdbId)) unseenIds.add(exposure.tmdbId);
  }
  for (const signal of appealSignals) {
    if (!seenIds.has(signal.tmdbId)) unseenIds.add(signal.tmdbId);
  }

  const seenCounts = new Map<string, number>();
  const unseenCounts = new Map<string, number>();
  const bucketKeys = (movie: Movie) => {
    const keys: string[] = [];
    if (movie.releaseDate) keys.push(`decade:${Math.floor(Number(movie.releaseDate.slice(0, 4)) / 10) * 10}`);
    for (const genre of movie.genres.slice(0, 2)) keys.push(`genre:${genre.name}`);
    return keys;
  };
  const record = (ids: Set<number>, counts: Map<string, number>) => {
    for (const tmdbId of ids) {
      const movie = byId.get(tmdbId);
      if (!movie) continue;
      for (const key of bucketKeys(movie)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  };
  record(seenIds, seenCounts);
  record(unseenIds, unseenCounts);

  const rateFor = (key: string) => {
    const seen = seenCounts.get(key) ?? 0;
    const unseen = unseenCounts.get(key) ?? 0;
    // Laplace-smoothed; buckets with no history sit at 0.5.
    return (seen + 1) / (seen + unseen + 2);
  };

  return (movie: Movie) => {
    const keys = bucketKeys(movie);
    const historyRate = keys.length ? keys.reduce((sum, key) => sum + rateFor(key), 0) / keys.length : 0.5;
    return (0.35 + 0.65 * mainstreamScore(movie)) * (0.25 + 0.75 * historyRate);
  };
}

/**
 * The deck's P(seen) estimator: learned logistic when the user has enough
 * swipe history, blended toward the heuristic prior with low label counts.
 */
export function buildSeenProbability(
  ratings: Rating[],
  exposures: MovieExposure[],
  appealSignals: AppealSignal[],
  byId: Map<number, Movie>
): (movie: Movie) => number {
  const heuristic = buildSeenPrior(ratings, exposures, appealSignals, byId);
  const labels = collectLabels(ratings, exposures, appealSignals, byId);
  const logistic = fitLogistic(labels);
  if (!logistic) return heuristic;

  const confidence = Math.min(1, labels.length / FULL_CONFIDENCE_LABELS);
  return (movie: Movie) => {
    const learned = logistic(movie);
    const prior = heuristic(movie);
    return confidence * learned + (1 - confidence) * prior;
  };
}
