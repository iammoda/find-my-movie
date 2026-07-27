import {
  applyComparisonResult,
  bandMidpoint,
  initialBounds,
  legacyRatingFor,
  nextOpponentIndex,
  opponentAdjustment,
  placementIndex,
  rankScoreForPlacement,
  sortedBucket
} from "@/lib/ranking";
import type { MovieStore, RatingRankUpdate } from "@/lib/store";
import type { Rating, Verdict } from "@/lib/types";

/**
 * Stateless placement flow for the comparative ranking instrument.
 *
 * The client accumulates the comparison steps for the movie being placed and sends the
 * full list on every request; the server replays them against the (stable) bucket order
 * to derive bounds. No writes besides the provisional rating happen until placement is
 * final, so replays are deterministic within a session.
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

export async function beginPlacement(
  store: MovieStore,
  tmdbId: number,
  verdict: Verdict,
  profileId?: string
): Promise<BeginPlacementResult> {
  const ratings = await store.listRatings(profileId);
  const previousRating = ratings.find((rating) => rating.tmdbId === tmdbId) ?? null;
  const bucket = sortedBucket(ratings, verdict, tmdbId);

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
  const ratings = await store.listRatings(profileId);
  const rating = ratings.find((item) => item.tmdbId === tmdbId);
  if (!rating?.verdict) {
    throw new Error(`No verdict found for movie ${tmdbId}; submit a verdict before comparisons.`);
  }

  const verdict = rating.verdict;
  const bucket = sortedBucket(ratings, verdict, tmdbId);

  // Replay the session's comparisons to rebuild bounds and resolve each opponent.
  let bounds = initialBounds(bucket.length);
  const resolved: Array<{ opponent: Rating; preferredNew: boolean }> = [];
  for (const step of steps) {
    const opponentIndex = nextOpponentIndex(bounds);
    if (opponentIndex == null) break;
    resolved.push({ opponent: bucket[opponentIndex], preferredNew: step.preferredNew });
    bounds = applyComparisonResult(bounds, step.preferredNew);
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
  for (const { opponent, preferredNew } of resolved) {
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
