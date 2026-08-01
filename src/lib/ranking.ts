import type { Rating, RatingValue, Verdict } from "@/lib/types";

/**
 * Comparative ranking engine ("which did you prefer?").
 *
 * Every seen movie gets a verdict bucket (loved / fine / disliked) and a continuous
 * rank score (0-10) inside that bucket's band. Placement inside a bucket is a
 * binary-search insert driven by head-to-head comparisons against movies already
 * in the bucket. Scores are only ever derived from real comparisons - we never
 * fabricate an ordering between movies the user has not compared.
 */

export const MAX_COMPARISON_ROUNDS = 3;

export interface VerdictBand {
  min: number;
  max: number;
}

export const VERDICT_BANDS: Record<Verdict, VerdictBand> = {
  loved: { min: 6.7, max: 10 },
  fine: { min: 3.3, max: 6.7 },
  disliked: { min: 0, max: 3.3 }
};

/** Small nudge applied to comparison opponents so seed-score ties break over time. */
const OPPONENT_NUDGE = 0.05;

export function bandFor(verdict: Verdict): VerdictBand {
  return VERDICT_BANDS[verdict];
}

export function bandMidpoint(verdict: Verdict): number {
  const band = bandFor(verdict);
  return round((band.min + band.max) / 2);
}

export function verdictForRankScore(rankScore: number): Verdict {
  if (rankScore >= VERDICT_BANDS.loved.min) return "loved";
  if (rankScore >= VERDICT_BANDS.fine.min) return "fine";
  return "disliked";
}

/** Seed (verdict, rankScore) for legacy 5-value ratings. Used by the backfill migration. */
export function seedFromLegacyRating(rating: RatingValue): { verdict: Verdict; rankScore: number } | null {
  switch (rating) {
    case "best_ever":
      return { verdict: "loved", rankScore: 9.5 };
    case "like":
      return { verdict: "loved", rankScore: 7.5 };
    case "skip":
      return { verdict: "fine", rankScore: 5.0 };
    case "dislike":
      return { verdict: "disliked", rankScore: 3.0 };
    case "hate":
      return { verdict: "disliked", rankScore: 1.0 };
    default:
      return null;
  }
}

/** Legacy 5-value rating derived from the new representation (back-compat for old code paths). */
export function legacyRatingFor(verdict: Verdict, rankScore?: number | null): RatingValue {
  const score = rankScore ?? bandMidpoint(verdict);
  if (verdict === "loved") return score >= 9 ? "best_ever" : "like";
  if (verdict === "disliked") return score <= 1.5 ? "hate" : "dislike";
  return "skip";
}

/**
 * A rating's position is informative (safe to compare against) when a real
 * comparison ever touched it, or its score has moved off the seeded band
 * midpoint. Rows still sitting untouched at the exact midpoint are either
 * migrated legacy ratings (often movies the user never saw) or placements the
 * user skipped - both are useless binary-search anchors.
 */
export function confirmedPlacement(rating: Rating, comparedIds: Set<number>): boolean {
  if (comparedIds.has(rating.tmdbId)) return true;
  if (!rating.verdict || rating.rankScore == null) return false;
  return rating.rankScore !== bandMidpoint(rating.verdict);
}

/**
 * Ratings in a verdict bucket, best first. Stable tie-break on updatedAt then
 * tmdbId. When `comparedIds` is given, only confirmed placements are included
 * so unconfirmed (possibly unseen) movies never become comparison opponents.
 */
export function sortedBucket(ratings: Rating[], verdict: Verdict, excludeTmdbId?: number, comparedIds?: Set<number>): Rating[] {
  return ratings
    .filter(
      (rating) =>
        rating.verdict === verdict &&
        rating.rankScore != null &&
        rating.tmdbId !== excludeTmdbId &&
        (comparedIds == null || confirmedPlacement(rating, comparedIds))
    )
    .sort((a, b) => {
      if (b.rankScore! !== a.rankScore!) return b.rankScore! - a.rankScore!;
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
      return a.tmdbId - b.tmdbId;
    });
}

export interface PlacementBounds {
  /** Inclusive lower insertion index (0 = best position). */
  lo: number;
  /** Exclusive upper insertion index. */
  hi: number;
  /** Comparisons asked so far. */
  round: number;
}

export function initialBounds(bucketSize: number): PlacementBounds {
  return { lo: 0, hi: bucketSize, round: 0 };
}

/** Index of the next comparison opponent inside the bucket, or null when placement is decided. */
export function nextOpponentIndex(bounds: PlacementBounds): number | null {
  if (bounds.lo >= bounds.hi || bounds.round >= MAX_COMPARISON_ROUNDS) return null;
  return Math.floor((bounds.lo + bounds.hi) / 2);
}

/** Narrow the bounds after a comparison. `preferredNew` = user preferred the movie being placed. */
export function applyComparisonResult(bounds: PlacementBounds, preferredNew: boolean): PlacementBounds {
  const mid = Math.floor((bounds.lo + bounds.hi) / 2);
  return preferredNew
    ? { lo: bounds.lo, hi: mid, round: bounds.round + 1 }
    : { lo: mid + 1, hi: bounds.hi, round: bounds.round + 1 };
}

/**
 * Narrow the bounds around a specific opponent's bucket index (replay by id).
 * Returns null for stale steps - opponent outside the open window, e.g. after
 * a mid-session "haven't seen" deletion reshuffled the bucket - so they are
 * skipped instead of corrupting the bounds.
 */
export function applyComparisonAtIndex(bounds: PlacementBounds, opponentIndex: number, preferredNew: boolean): PlacementBounds | null {
  if (opponentIndex < bounds.lo || opponentIndex >= bounds.hi) return null;
  return preferredNew
    ? { lo: bounds.lo, hi: opponentIndex, round: bounds.round + 1 }
    : { lo: opponentIndex + 1, hi: bounds.hi, round: bounds.round + 1 };
}

/** Final insertion index for the current bounds (midpoint when rounds ran out). */
export function placementIndex(bounds: PlacementBounds): number {
  return Math.floor((bounds.lo + bounds.hi) / 2);
}

/**
 * Rank score for inserting at `index` into `bucket` (best first): midpoint between the
 * neighbors' scores, with the band edges acting as sentinels. Never re-scores neighbors,
 * so uncompared movies keep their seeded scores.
 */
export function rankScoreForPlacement(bucket: Rating[], index: number, verdict: Verdict): number {
  const band = bandFor(verdict);
  if (!bucket.length) return bandMidpoint(verdict);
  const upper = index <= 0 ? band.max : bucket[index - 1].rankScore ?? band.max;
  const lower = index >= bucket.length ? band.min : bucket[index].rankScore ?? band.min;
  return round((upper + lower) / 2);
}

export interface OpponentAdjustment {
  tmdbId: number;
  verdict: Verdict;
  rankScore: number;
}

/**
 * Tiny score nudges for comparison opponents (winner up, loser down, clamped to the band).
 * Breaks seed-score ties using only real comparison outcomes.
 */
export function opponentAdjustment(opponent: Rating, opponentWon: boolean): OpponentAdjustment | null {
  if (!opponent.verdict || opponent.rankScore == null) return null;
  const band = bandFor(opponent.verdict);
  const nudged = opponent.rankScore + (opponentWon ? OPPONENT_NUDGE : -OPPONENT_NUDGE);
  const clamped = round(Math.min(band.max, Math.max(band.min, nudged)));
  if (clamped === opponent.rankScore) return null;
  return { tmdbId: opponent.tmdbId, verdict: opponent.verdict, rankScore: clamped };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
