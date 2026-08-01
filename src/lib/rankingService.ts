import {
  applyComparisonAtIndex,
  bandMidpoint,
  initialBounds,
  legacyRatingFor,
  MAX_COMPARISON_ROUNDS,
  nextOpponentIndex,
  opponentAdjustment,
  placementIndex,
  rankScoreForPlacement,
  sortedBucket
} from "@/lib/ranking";
import type { MovieStore, RatingRankUpdate } from "@/lib/store";
import { mediaTypeOfId } from "@/lib/mediaId";
import type { Comparison, Rating, Verdict } from "@/lib/types";

/**
 * Stateless placement flow for the comparative ranking instrument.
 *
 * The client accumulates the comparison steps for the movie being placed and sends the
 * full list on every request; the server replays them against the bucket - resolving
 * each opponent by id, so bucket changes between requests (another rating, an undo, a
 * mid-session "haven't seen" deletion) skip the affected step instead of silently
 * recording a comparison against a different movie.
 *
 * Opponents are drawn only from confirmed placements (see confirmedPlacement): rows
 * still sitting untouched at their seeded band midpoint are never shown, because they
 * are disproportionately movies the user never actually saw.
 */

export interface ComparisonStep {
  opponentTmdbId: number;
  preferredNew: boolean;
}

export interface PlacementState {
  done: boolean;
  rankScore: number | null;
  opponentTmdbId: number | null;
  round: number;
  bucketSize: number;
}

export interface BeginPlacementResult {
  rating: Rating;
  previousRating: Rating | null;
  placement: PlacementState;
}

function comparedIdSet(comparisons: Comparison[]): Set<number> {
  const ids = new Set<number>();
  for (const comparison of comparisons) {
    ids.add(comparison.winnerTmdbId);
    ids.add(comparison.loserTmdbId);
  }
  return ids;
}

/** Placement buckets never cross media: a movie is only ever compared against movies, TV against TV. */
function sameMediaRatings(ratings: Rating[], tmdbId: number): Rating[] {
  const mediaType = mediaTypeOfId(tmdbId);
  return ratings.filter((rating) => mediaTypeOfId(rating.tmdbId) === mediaType);
}

/**
 * Opponent bucket: confirmed placements preferred, but when none exist yet
 * (fresh user, first ratings in a new media type) fall back to unconfirmed
 * rows - otherwise no comparison could ever run and every rating would sit at
 * its band midpoint forever. The fallback pool is the user's own fresh
 * verdict-flow ratings, so the "unseen legacy row" protection only matters
 * once confirmed opponents exist to prefer.
 */
function opponentBucket(ratings: Rating[], verdict: Verdict, tmdbId: number, comparisons: Comparison[]): Rating[] {
  const pool = sameMediaRatings(ratings, tmdbId);
  const confirmed = sortedBucket(pool, verdict, tmdbId, comparedIdSet(comparisons));
  if (confirmed.length) return confirmed;
  return sortedBucket(pool, verdict, tmdbId);
}

export async function beginPlacement(
  store: MovieStore,
  tmdbId: number,
  verdict: Verdict,
  profileId?: string
): Promise<BeginPlacementResult> {
  const [ratings, comparisons] = await Promise.all([store.listRatings(profileId), store.listComparisons(profileId)]);
  const previousRating = ratings.find((rating) => rating.tmdbId === tmdbId) ?? null;
  const bucket = opponentBucket(ratings, verdict, tmdbId, comparisons);

  const provisionalScore = bandMidpoint(verdict);
  const rating = await store.upsertRating(tmdbId, legacyRatingFor(verdict, provisionalScore), profileId, {
    verdict,
    rankScore: provisionalScore
  });

  const bounds = initialBounds(bucket.length);
  const opponentIndex = nextOpponentIndex(bounds);

  return {
    rating,
    previousRating,
    placement: {
      done: opponentIndex == null,
      rankScore: opponentIndex == null ? provisionalScore : null,
      opponentTmdbId: opponentIndex == null ? null : bucket[opponentIndex].tmdbId,
      round: 0,
      bucketSize: bucket.length
    }
  };
}

export interface AdvancePlacementResult {
  placement: PlacementState;
  rating: Rating | null;
}

export async function advancePlacement(
  store: MovieStore,
  tmdbId: number,
  steps: ComparisonStep[],
  profileId?: string
): Promise<AdvancePlacementResult> {
  const [ratings, comparisons] = await Promise.all([store.listRatings(profileId), store.listComparisons(profileId)]);
  const rating = ratings.find((item) => item.tmdbId === tmdbId);
  if (!rating?.verdict) {
    throw new Error(`No verdict found for movie ${tmdbId}; submit a verdict before comparisons.`);
  }

  const verdict = rating.verdict;
  const bucket = opponentBucket(ratings, verdict, tmdbId, comparisons);

  // Replay the session's comparisons, resolving each opponent by id. Steps whose
  // opponent left the bucket (deleted, re-rated) or drifted outside the current
  // window are skipped - they narrow nothing and consume no round.
  let bounds = initialBounds(bucket.length);
  const resolved: Array<{ opponent: Rating; preferredNew: boolean; stale: boolean }> = [];
  for (const step of steps) {
    if (bounds.lo >= bounds.hi || bounds.round >= MAX_COMPARISON_ROUNDS) break;
    const opponentIndex = bucket.findIndex((item) => item.tmdbId === step.opponentTmdbId);
    if (opponentIndex === -1) continue;
    const narrowed = applyComparisonAtIndex(bounds, opponentIndex, step.preferredNew);
    if (!narrowed) {
      resolved.push({ opponent: bucket[opponentIndex], preferredNew: step.preferredNew, stale: true });
      continue;
    }
    resolved.push({ opponent: bucket[opponentIndex], preferredNew: step.preferredNew, stale: false });
    bounds = narrowed;
  }

  // Persist only the newest comparison; earlier ones were recorded by previous requests.
  const latest = resolved[resolved.length - 1];
  if (latest && steps.length) {
    const winner = latest.preferredNew ? tmdbId : latest.opponent.tmdbId;
    const loser = latest.preferredNew ? latest.opponent.tmdbId : tmdbId;
    await store.addComparison(winner, loser, profileId);
  }

  const opponentIndex = nextOpponentIndex(bounds);
  if (opponentIndex != null) {
    return {
      rating: null,
      placement: {
        done: false,
        rankScore: null,
        opponentTmdbId: bucket[opponentIndex].tmdbId,
        round: bounds.round,
        bucketSize: bucket.length
      }
    };
  }

  // Finalize: place the movie and nudge compared opponents (winner up, loser down).
  const index = placementIndex(bounds);
  const rankScore = rankScoreForPlacement(bucket, index, verdict);

  const nudges: RatingRankUpdate[] = [];
  for (const { opponent, preferredNew, stale } of resolved) {
    if (stale) continue;
    const adjustment = opponentAdjustment(opponent, !preferredNew);
    if (adjustment) nudges.push(adjustment);
  }
  if (nudges.length) await store.updateRatingRanks(nudges, profileId);

  const updatedRating = await store.upsertRating(tmdbId, legacyRatingFor(verdict, rankScore), profileId, {
    verdict,
    rankScore
  });

  return {
    rating: updatedRating,
    placement: {
      done: true,
      rankScore,
      opponentTmdbId: null,
      round: bounds.round,
      bucketSize: bucket.length
    }
  };
}
