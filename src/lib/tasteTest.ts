import { MIN_BROWSE_POPULARITY, MIN_BROWSE_VOTE_COUNT, MIN_STABLE_RELEASE_DAYS } from "@/lib/constants";
import { handledMovieIds } from "@/lib/handled";
import { isPrimaryAudienceMovie } from "@/lib/language";
import { isReleasedAtLeastDaysAgo, mainstreamScore, qualityScore } from "@/lib/quality";
import { ratingWeight } from "@/lib/rating";
import { deriveTasteFacts, factKey, isDeepFact } from "@/lib/taste";
import type { AppealSignal, Movie, MovieExposure, Rating } from "@/lib/types";

const MIN_TASTE_TEST_VOTE_AVERAGE = 6.25;

// Relaxed floors keep the deck alive once the strict mainstream pool is
// exhausted by a heavy rater; quality still bounded, just mid-tier.
const RELAXED_MIN_VOTE_COUNT = 200;
const RELAXED_MIN_VOTE_AVERAGE = 5.8;
const RELAXED_MIN_POPULARITY = 4;
/** Rebuild with relaxed floors when the strict queue comes up shorter than limit/N. */
const RELAXED_QUEUE_TRIGGER_DIVISOR = 3;

// Model-belief probes (predicted rank score is on the user's 0-10 scale).
const BELIEVED_HIT_MIN_SCORE = 7.5;
const FRONTIER_MIN_SCORE = 5.5;
const FRONTIER_PEAK_SCORE = 6.5;
const BELIEVED_MISS_MAX_SCORE = 3.5;
const UNCERTAIN_BAND = 0.5;
const EXPOSURE_REPEAT_PENALTY = 0.08;
const MAX_PROBE_BUCKET = 30;
/** Keep disconfirming probes sparse: at most ~1 believed miss per this many cards. */
const MISS_PROBE_INTERVAL = 8;
/** Trait-gap probes target deep facts with at most this many rated examples. */
const TRAIT_GAP_MAX_EVIDENCE = 2;

/**
 * Exploit/explore schedule: the share of the deck spent testing the model's
 * beliefs ramps with how much rated history powers the model, capped at 55%
 * so coverage/discovery always keeps at least 45%.
 */
const EXPLOIT_SHARE_MAX = 0.55;
const CONFIDENCE_MIN_SAMPLES = 15;
const CONFIDENCE_FULL_SAMPLES = 100;

interface ProbeWeights {
  frontier: number;
  neighborhood: number;
  uncertain: number;
  hits: number;
  traitGap: number;
  misses: number;
}

const DEFAULT_PROBE_WEIGHTS: ProbeWeights = { frontier: 0.3, neighborhood: 0.25, uncertain: 0.15, hits: 0.15, traitGap: 0.1, misses: 0.05 };
/** Hot streak: the user is agreeing with everything - push harder, riskier probes. */
const HOT_PROBE_WEIGHTS: ProbeWeights = { frontier: 0.35, neighborhood: 0.2, uncertain: 0.15, hits: 0.05, traitGap: 0.15, misses: 0.1 };
/** Cold streak: rebuild confidence with likely hits before probing again. */
const COLD_PROBE_WEIGHTS: ProbeWeights = { frontier: 0.15, neighborhood: 0.25, uncertain: 0.05, hits: 0.4, traitGap: 0.15, misses: 0 };

export function usableTasteTestMovie(movie: Movie, relaxed = false) {
  const minVotes = relaxed ? RELAXED_MIN_VOTE_COUNT : MIN_BROWSE_VOTE_COUNT;
  const minAverage = relaxed ? RELAXED_MIN_VOTE_AVERAGE : MIN_TASTE_TEST_VOTE_AVERAGE;
  const minPopularity = relaxed ? RELAXED_MIN_POPULARITY : MIN_BROWSE_POPULARITY;
  return (
    !movie.adult &&
    Boolean(movie.posterPath) &&
    Boolean(movie.overview) &&
    movie.voteCount >= minVotes &&
    movie.voteAverage >= minAverage &&
    movie.popularity >= minPopularity &&
    isReleasedAtLeastDaysAgo(movie.releaseDate, MIN_STABLE_RELEASE_DAYS) &&
    isPrimaryAudienceMovie(movie)
  );
}

function movieSignature(movie: Movie) {
  const facts = deriveTasteFacts(movie);
  const deepFactCount = facts.filter((fact) => ["tone", "pacing", "theme", "stakes", "structure"].includes(fact.kind)).length;
  const genreCount = movie.genres.length;
  const decade = movie.releaseDate ? Math.floor(Number(movie.releaseDate.slice(0, 4)) / 10) * 10 : 0;
  return { deepFactCount, genreCount, decade };
}

function contrastScore(movie: Movie) {
  const signature = movieSignature(movie);
  const acclaim = qualityScore(movie);
  const mainstream = mainstreamScore(movie);
  const popularityBand = Math.min(1, Math.log10(Math.max(1, movie.popularity)) / 3);
  const divisiveBand = Math.abs(movie.voteAverage - 7.2) < 0.55 ? 0.24 : 0;

  return mainstream * 0.45 + acclaim * 0.16 + popularityBand * 0.2 + signature.deepFactCount * 0.025 + divisiveBand;
}

function recentRatingStreak(ratings: Rating[]) {
  const recent = [...ratings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  const positiveCount = recent.filter((rating) => ratingWeight(rating.rating) > 0).length;
  const negativeCount = recent.filter((rating) => ratingWeight(rating.rating) < 0).length;
  return { positiveCount, negativeCount };
}

function interleaveBuckets(buckets: Movie[][], limit: number) {
  const result: Movie[] = [];
  const seen = new Set<number>();
  let index = 0;

  while (result.length < limit && buckets.some((bucket) => index < bucket.length)) {
    for (const bucket of buckets) {
      const movie = bucket[index];
      if (movie && !seen.has(movie.tmdbId)) {
        result.push(movie);
        seen.add(movie.tmdbId);
        if (result.length >= limit) break;
      }
    }
    index += 1;
  }

  return result;
}

interface WeightedGroup {
  movies: Movie[];
  weight: number;
}

/**
 * Smooth weighted round-robin: every slot each group gains its weight as
 * credit, the richest group emits its next unseen movie and pays back the
 * total. Deterministic, and group shares converge to the weight ratios.
 */
function weightedInterleave(groups: WeightedGroup[], limit: number): Movie[] {
  const active = groups.filter((group) => group.weight > 0 && group.movies.length > 0);
  if (!active.length) return [];

  const totalWeight = active.reduce((sum, group) => sum + group.weight, 0);
  const credits = active.map(() => 0);
  const cursors = active.map(() => 0);
  const result: Movie[] = [];
  const seen = new Set<number>();

  const advance = (index: number) => {
    const { movies } = active[index];
    while (cursors[index] < movies.length && seen.has(movies[cursors[index]].tmdbId)) cursors[index] += 1;
    return cursors[index] < movies.length;
  };

  while (result.length < limit) {
    let best = -1;
    for (let index = 0; index < active.length; index += 1) {
      credits[index] += active[index].weight;
      if (!advance(index)) continue;
      if (best === -1 || credits[index] > credits[best]) best = index;
    }
    if (best === -1) break;

    const movie = active[best].movies[cursors[best]];
    cursors[best] += 1;
    credits[best] -= totalWeight;
    result.push(movie);
    seen.add(movie.tmdbId);
  }

  return result;
}

function latestExposureSource(tmdbId: number, exposures: MovieExposure[]) {
  return exposures
    .filter((exposure) => exposure.tmdbId === tmdbId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.source;
}

/**
 * How plausible is it that this user has seen this movie? Blends the movie's
 * mainstream reach with the user's own history: decades/genres they keep
 * marking "haven't seen" (or swiping away unseen) sink, well-rated ones rise.
 * Multiplied into probe and base ordering so deck slots stay ratable.
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

interface TasteProbeSignals {
  positive: Map<string, number>;
  negative: Map<string, number>;
}

function buildTasteProbeSignals(ratings: Rating[], exposures: MovieExposure[], byId: Map<number, Movie>): TasteProbeSignals {
  const signals: TasteProbeSignals = {
    positive: new Map(),
    negative: new Map()
  };

  for (const rating of ratings) {
    const ratedMovie = byId.get(rating.tmdbId);
    const weight = ratingWeight(rating.rating);
    if (!ratedMovie || weight === 0) continue;

    const source = latestExposureSource(rating.tmdbId, exposures);
    const sourceBoost = source === "manual_search" ? 1.8 : 0.7;
    for (const fact of deriveTasteFacts(ratedMovie)) {
      const deepBoost = isDeepFact(fact) ? 1 : 0.25;
      const signal = Math.abs(weight) * fact.weight * sourceBoost * deepBoost;
      if (signal <= 0) continue;
      const key = factKey(fact);
      const target = weight > 0 ? signals.positive : signals.negative;
      target.set(key, (target.get(key) ?? 0) + signal);
    }
  }

  return signals;
}

function manualTasteProbeScore(movie: Movie, signals: TasteProbeSignals) {
  if (!signals.positive.size && !signals.negative.size) return 0;

  return deriveTasteFacts(movie).reduce((score, fact) => {
    const key = factKey(fact);
    const deepBoost = isDeepFact(fact) ? 1 : 0.25;
    return score + (signals.positive.get(key) ?? 0) * fact.weight * deepBoost - (signals.negative.get(key) ?? 0) * fact.weight * deepBoost * 1.15;
  }, 0);
}

export interface TasteTestQueueOptions {
  /** Swiped cards (want to watch / pass) are unrated and unratable; keep them out of the deck. */
  appealSignals?: AppealSignal[];
  /** tmdbId -> predicted rank score (0-10) from the learned taste model. */
  predictions?: Map<number, number>;
  /** tmdbId -> embedding similarity (0-1) to the user's top-loved movies. */
  neighborhoodSimilarity?: Map<number, number>;
  /** Rating samples powering the learned model; scales the exploit share. */
  modelRatingSampleCount?: number;
}

interface ModelProbeBuckets {
  frontier: Movie[];
  neighborhood: Movie[];
  uncertain: Movie[];
  believedHits: Movie[];
  traitGap: Movie[];
  believedMisses: Movie[];
}

interface ScoredMovie {
  movie: Movie;
  key: number;
}

function topMovies(items: ScoredMovie[], cap: number): Movie[] {
  return items
    .sort((a, b) => b.key - a.key)
    .slice(0, cap)
    .map((item) => item.movie);
}

/**
 * Belief-testing buckets, all discounted by the seen prior and repeat penalty:
 * - frontier: predicted just above neutral - sharpens the like/dislike boundary
 * - neighborhood: unrated movies embedding-close to the user's top-loved
 * - uncertain: predictions near the middle, where a verdict is most informative
 * - believedHits: confident positives, validating what the model thinks the user loves
 * - traitGap: carries deep traits the model has little evidence about
 * - believedMisses: confident negatives, kept sparse but never zero for calibration
 */
function buildModelProbeBuckets(
  candidates: Movie[],
  options: TasteTestQueueOptions,
  exposedCounts: Map<number, number>,
  seenPrior: (movie: Movie) => number,
  traitEvidence: Map<string, number>,
  limit: number
): ModelProbeBuckets {
  const predictions = options.predictions ?? new Map<number, number>();
  const neighborhoodSimilarity = options.neighborhoodSimilarity ?? new Map<number, number>();
  const frontier: ScoredMovie[] = [];
  const neighborhood: ScoredMovie[] = [];
  const uncertain: ScoredMovie[] = [];
  const believedHits: ScoredMovie[] = [];
  const traitGap: ScoredMovie[] = [];
  const believedMisses: ScoredMovie[] = [];

  for (const movie of candidates) {
    const prior = seenPrior(movie);
    const repeatPenalty = (exposedCounts.get(movie.tmdbId) ?? 0) * EXPOSURE_REPEAT_PENALTY;
    const predicted = predictions.get(movie.tmdbId);

    if (predicted !== undefined) {
      if (predicted <= BELIEVED_MISS_MAX_SCORE) {
        believedMisses.push({ movie, key: ((5 - predicted) / 5) * prior - repeatPenalty });
      } else if (predicted >= BELIEVED_HIT_MIN_SCORE) {
        believedHits.push({ movie, key: ((predicted - 5) / 5) * prior - repeatPenalty });
      } else if (predicted > FRONTIER_MIN_SCORE) {
        frontier.push({ movie, key: (1 - Math.abs(predicted - FRONTIER_PEAK_SCORE)) * prior - repeatPenalty });
      } else if (Math.abs(predicted - 5) <= UNCERTAIN_BAND) {
        uncertain.push({ movie, key: (1 - Math.abs(predicted - 5) / UNCERTAIN_BAND) * prior - repeatPenalty });
      }
    }

    const similarity = neighborhoodSimilarity.get(movie.tmdbId);
    if (similarity !== undefined && (predicted === undefined || predicted > BELIEVED_MISS_MAX_SCORE)) {
      neighborhood.push({ movie, key: similarity * prior - repeatPenalty });
    }

    if (traitEvidence.size) {
      let gap = 0;
      for (const fact of deriveTasteFacts(movie)) {
        if (!isDeepFact(fact)) continue;
        const evidence = traitEvidence.get(factKey(fact)) ?? 0;
        if (evidence > TRAIT_GAP_MAX_EVIDENCE) continue;
        gap += fact.weight * ((TRAIT_GAP_MAX_EVIDENCE + 1 - evidence) / (TRAIT_GAP_MAX_EVIDENCE + 1));
      }
      if (gap > 0 && (predicted === undefined || predicted > BELIEVED_MISS_MAX_SCORE)) {
        traitGap.push({ movie, key: gap * prior - repeatPenalty });
      }
    }
  }

  return {
    frontier: topMovies(frontier, MAX_PROBE_BUCKET),
    neighborhood: topMovies(neighborhood, MAX_PROBE_BUCKET),
    uncertain: topMovies(uncertain, MAX_PROBE_BUCKET),
    believedHits: topMovies(believedHits, MAX_PROBE_BUCKET),
    traitGap: topMovies(traitGap, MAX_PROBE_BUCKET),
    believedMisses: topMovies(believedMisses, Math.max(1, Math.floor(limit / MISS_PROBE_INTERVAL)))
  };
}

/** Count of rated movies carrying each deep taste fact - the model's per-trait evidence. */
function buildTraitEvidence(ratings: Rating[], byId: Map<number, Movie>): Map<string, number> {
  const evidence = new Map<string, number>();
  for (const rating of ratings) {
    const movie = byId.get(rating.tmdbId);
    if (!movie) continue;
    const counted = new Set<string>();
    for (const fact of deriveTasteFacts(movie)) {
      if (!isDeepFact(fact)) continue;
      const key = factKey(fact);
      if (counted.has(key)) continue;
      counted.add(key);
      evidence.set(key, (evidence.get(key) ?? 0) + 1);
    }
  }
  return evidence;
}

export function buildTasteTestQueue(
  movies: Movie[],
  ratings: Rating[],
  exposures: MovieExposure[],
  limit = 80,
  options: TasteTestQueueOptions = {}
): Movie[] {
  const strict = buildQueueWithFloors(movies, ratings, exposures, limit, options, false);
  if (strict.length >= Math.ceil(limit / RELAXED_QUEUE_TRIGGER_DIVISOR)) return strict;

  // Strict mainstream pool is nearly exhausted; rebuild with relaxed quality
  // floors so heavy raters still get a full deck of ratable movies.
  const relaxed = buildQueueWithFloors(movies, ratings, exposures, limit, options, true);
  return relaxed.length > strict.length ? relaxed : strict;
}

function buildQueueWithFloors(
  movies: Movie[],
  ratings: Rating[],
  exposures: MovieExposure[],
  limit: number,
  options: TasteTestQueueOptions,
  relaxed: boolean
): Movie[] {
  const appealSignals = options.appealSignals ?? [];
  const handledIds = handledMovieIds(ratings, exposures, appealSignals);
  const byId = new Map(movies.map((movie) => [movie.tmdbId, movie]));
  const exposedCounts = new Map<number, number>();
  for (const exposure of exposures) {
    if (exposure.source === "not_seen") continue;
    exposedCounts.set(exposure.tmdbId, (exposedCounts.get(exposure.tmdbId) ?? 0) + 1);
  }

  const seenPrior = buildSeenPrior(ratings, exposures, appealSignals, byId);
  const candidates = movies
    .filter((movie) => usableTasteTestMovie(movie, relaxed) && !handledIds.has(movie.tmdbId))
    .map((movie) => ({
      movie,
      score: (contrastScore(movie) - (exposedCounts.get(movie.tmdbId) ?? 0) * EXPOSURE_REPEAT_PENALTY) * seenPrior(movie)
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.movie);

  const { positiveCount, negativeCount } = recentRatingStreak(ratings);

  // Exploit share ramps with model confidence; zero when the model has no signal.
  const hasModelSignal = Boolean(options.predictions?.size || options.neighborhoodSimilarity?.size);
  const confidence = Math.max(
    0,
    Math.min(1, ((options.modelRatingSampleCount ?? 0) - CONFIDENCE_MIN_SAMPLES) / (CONFIDENCE_FULL_SAMPLES - CONFIDENCE_MIN_SAMPLES))
  );
  const exploitShare = hasModelSignal ? EXPLOIT_SHARE_MAX * confidence : 0;

  // Confident misses are only eligible through the sparse probe bucket - the
  // coverage buckets below must not refill the deck with predicted dislikes.
  const confidentMissIds = new Set<number>();
  if (options.predictions) {
    for (const [tmdbId, predicted] of options.predictions) {
      if (predicted <= BELIEVED_MISS_MAX_SCORE) confidentMissIds.add(tmdbId);
    }
  }
  const coverageCandidates = confidentMissIds.size
    ? candidates.filter((movie) => !confidentMissIds.has(movie.tmdbId))
    : candidates;

  const genreBuckets = new Map<string, Movie[]>();
  const decadeBuckets = new Map<string, Movie[]>();
  const divisive: Movie[] = [];
  const anchors: Movie[] = [];
  const tasteProbeSignals = buildTasteProbeSignals(ratings, exposures, byId);
  const tasteProbes = coverageCandidates
    .map((movie) => ({
      movie,
      score: manualTasteProbeScore(movie, tasteProbeSignals)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.movie);

  for (const movie of coverageCandidates) {
    for (const genre of movie.genres.slice(0, 2)) {
      const bucket = genreBuckets.get(genre.name) ?? [];
      bucket.push(movie);
      genreBuckets.set(genre.name, bucket);
    }

    const decade = movie.releaseDate ? `${Math.floor(Number(movie.releaseDate.slice(0, 4)) / 10) * 10}s` : "unknown";
    const decadeBucket = decadeBuckets.get(decade) ?? [];
    decadeBucket.push(movie);
    decadeBuckets.set(decade, decadeBucket);

    if (movie.voteAverage >= 7.9 && movie.voteCount >= 4000) anchors.push(movie);
    if (movie.voteAverage >= 6.4 && movie.voteAverage <= 7.7 && movie.voteCount >= 2500) divisive.push(movie);
  }

  const genreLeaders = Array.from(genreBuckets.values()).map((bucket) => bucket.slice(0, 8));
  const decadeLeaders = Array.from(decadeBuckets.values()).map((bucket) => bucket.slice(0, 5));

  // Bucket caps shape the head of the deck; backfill keeps it full whenever
  // eligible candidates remain (e.g. a pool concentrated in few genres).
  const backfill = (queue: Movie[]) => {
    if (queue.length >= limit) return queue;
    const seen = new Set(queue.map((movie) => movie.tmdbId));
    for (const movie of coverageCandidates) {
      if (queue.length >= limit) break;
      if (seen.has(movie.tmdbId)) continue;
      seen.add(movie.tmdbId);
      queue.push(movie);
    }
    return queue;
  };

  if (exploitShare > 0) {
    const traitEvidence = buildTraitEvidence(ratings, byId);
    const probes = buildModelProbeBuckets(candidates, options, exposedCounts, seenPrior, traitEvidence, limit);
    const hasProbes = Object.values(probes).some((bucket) => bucket.length > 0);

    if (hasProbes) {
      const weights = positiveCount >= 7 ? HOT_PROBE_WEIGHTS : negativeCount >= 5 ? COLD_PROBE_WEIGHTS : DEFAULT_PROBE_WEIGHTS;
      const coverage = interleaveBuckets([anchors, divisive, ...genreLeaders, ...decadeLeaders], limit);
      return backfill(
        weightedInterleave(
          [
            { movies: probes.frontier, weight: exploitShare * weights.frontier },
            { movies: probes.neighborhood, weight: exploitShare * weights.neighborhood },
            { movies: probes.uncertain, weight: exploitShare * weights.uncertain },
            { movies: probes.believedHits, weight: exploitShare * weights.hits },
            { movies: probes.traitGap, weight: exploitShare * weights.traitGap },
            { movies: probes.believedMisses, weight: exploitShare * weights.misses },
            { movies: coverage, weight: 1 - exploitShare }
          ],
          limit
        )
      );
    }
  }

  if (positiveCount >= 7) {
    return backfill(interleaveBuckets([tasteProbes, divisive, ...genreLeaders, anchors, ...decadeLeaders], limit));
  }

  if (negativeCount >= 5) {
    return backfill(interleaveBuckets([anchors, tasteProbes, ...genreLeaders, divisive, ...decadeLeaders], limit));
  }

  if (tasteProbes.length) {
    return backfill(interleaveBuckets([anchors, tasteProbes, anchors, divisive, tasteProbes, ...genreLeaders, ...decadeLeaders], limit));
  }

  return backfill(interleaveBuckets([anchors, divisive, ...genreLeaders, ...decadeLeaders], limit));
}
