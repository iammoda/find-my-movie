import { describe, expect, it } from "vitest";
import {
  applyComparisonResult,
  bandMidpoint,
  initialBounds,
  legacyRatingFor,
  MAX_COMPARISON_ROUNDS,
  nextOpponentIndex,
  opponentAdjustment,
  placementIndex,
  rankScoreForPlacement,
  seedFromLegacyRating,
  sortedBucket,
  VERDICT_BANDS,
  verdictForRankScore
} from "@/lib/ranking";
import type { Rating, RatingValue, Verdict } from "@/lib/types";

let counter = 0;

function rankedRating(tmdbId: number, verdict: Verdict, rankScore: number | null): Rating {
  counter += 1;
  return {
    profileId: "default",
    tmdbId,
    rating: "like",
    verdict,
    rankScore,
    createdAt: new Date(2024, 0, counter).toISOString(),
    updatedAt: new Date(2024, 0, counter).toISOString()
  };
}

describe("verdict bands", () => {
  it("covers 0-10 with contiguous non-overlapping bands", () => {
    expect(VERDICT_BANDS.disliked.min).toBe(0);
    expect(VERDICT_BANDS.disliked.max).toBe(VERDICT_BANDS.fine.min);
    expect(VERDICT_BANDS.fine.max).toBe(VERDICT_BANDS.loved.min);
    expect(VERDICT_BANDS.loved.max).toBe(10);
  });

  it("maps rank scores back to verdicts", () => {
    expect(verdictForRankScore(9.5)).toBe("loved");
    expect(verdictForRankScore(6.7)).toBe("loved");
    expect(verdictForRankScore(5)).toBe("fine");
    expect(verdictForRankScore(3.3)).toBe("fine");
    expect(verdictForRankScore(1)).toBe("disliked");
  });
});

describe("legacy rating mapping", () => {
  it("seeds every legacy rating into a band", () => {
    expect(seedFromLegacyRating("best_ever")).toEqual({ verdict: "loved", rankScore: 9.5 });
    expect(seedFromLegacyRating("like")).toEqual({ verdict: "loved", rankScore: 7.5 });
    expect(seedFromLegacyRating("skip")).toEqual({ verdict: "fine", rankScore: 5.0 });
    expect(seedFromLegacyRating("dislike")).toEqual({ verdict: "disliked", rankScore: 3.0 });
    expect(seedFromLegacyRating("hate")).toEqual({ verdict: "disliked", rankScore: 1.0 });
  });

  it("round-trips seeds back to their legacy rating", () => {
    const values: RatingValue[] = ["best_ever", "like", "skip", "dislike", "hate"];
    for (const value of values) {
      const seed = seedFromLegacyRating(value)!;
      expect(legacyRatingFor(seed.verdict, seed.rankScore)).toBe(value);
    }
  });

  it("derives extremes from rank position, not gestures", () => {
    expect(legacyRatingFor("loved", 9.2)).toBe("best_ever");
    expect(legacyRatingFor("loved", 8.9)).toBe("like");
    expect(legacyRatingFor("disliked", 1.4)).toBe("hate");
    expect(legacyRatingFor("disliked", 2.0)).toBe("dislike");
  });
});

describe("sortedBucket", () => {
  it("returns only the verdict's movies, best first, excluding the placed movie", () => {
    const ratings = [
      rankedRating(1, "loved", 7.5),
      rankedRating(2, "loved", 9.5),
      rankedRating(3, "fine", 5),
      rankedRating(4, "loved", 8.2),
      rankedRating(5, "loved", null),
      rankedRating(6, "loved", 6.9)
    ];
    const bucket = sortedBucket(ratings, "loved", 4);
    expect(bucket.map((rating) => rating.tmdbId)).toEqual([2, 1, 6]);
  });

  it("breaks score ties stably by updatedAt", () => {
    const first = rankedRating(10, "loved", 7.5);
    const second = rankedRating(11, "loved", 7.5);
    expect(sortedBucket([second, first], "loved").map((rating) => rating.tmdbId)).toEqual([10, 11]);
  });
});

describe("binary-search placement", () => {
  it("finds the exact slot in a small bucket within max rounds", () => {
    // Bucket of 7: binary search resolves exactly in 3 rounds.
    let bounds = initialBounds(7);

    expect(nextOpponentIndex(bounds)).toBe(3);
    bounds = applyComparisonResult(bounds, false); // worse than bucket[3] -> slot in (3, 7]
    expect(bounds).toEqual({ lo: 4, hi: 7, round: 1 });
    expect(nextOpponentIndex(bounds)).toBe(5);
    bounds = applyComparisonResult(bounds, true); // better than bucket[5] -> slot in [4, 5]
    expect(bounds).toEqual({ lo: 4, hi: 5, round: 2 });
    expect(nextOpponentIndex(bounds)).toBe(4);
    bounds = applyComparisonResult(bounds, true); // better than bucket[4] -> slot 4 exactly
    expect(bounds).toEqual({ lo: 4, hi: 4, round: 3 });
    expect(nextOpponentIndex(bounds)).toBeNull();
    expect(placementIndex(bounds)).toBe(4);
  });

  it("stops after MAX_COMPARISON_ROUNDS and places at the bounds midpoint", () => {
    let bounds = initialBounds(100);
    let rounds = 0;
    while (nextOpponentIndex(bounds) != null) {
      bounds = applyComparisonResult(bounds, false);
      rounds += 1;
    }
    expect(rounds).toBe(MAX_COMPARISON_ROUNDS);
    expect(bounds.lo).toBeGreaterThan(0);
    const index = placementIndex(bounds);
    expect(index).toBeGreaterThanOrEqual(bounds.lo);
    expect(index).toBeLessThanOrEqual(bounds.hi);
  });

  it("asks nothing for an empty bucket", () => {
    expect(nextOpponentIndex(initialBounds(0))).toBeNull();
    expect(placementIndex(initialBounds(0))).toBe(0);
  });

  it("wins-all places at the very top", () => {
    let bounds = initialBounds(3);
    while (nextOpponentIndex(bounds) != null) {
      bounds = applyComparisonResult(bounds, true);
    }
    expect(placementIndex(bounds)).toBe(0);
  });
});

describe("rankScoreForPlacement", () => {
  const bucket = [rankedRating(1, "loved", 9.5), rankedRating(2, "loved", 8.0), rankedRating(3, "loved", 7.0)];

  it("uses the band midpoint for an empty bucket", () => {
    expect(rankScoreForPlacement([], 0, "loved")).toBe(bandMidpoint("loved"));
  });

  it("places above the best using the band max as sentinel", () => {
    expect(rankScoreForPlacement(bucket, 0, "loved")).toBeCloseTo((10 + 9.5) / 2, 3);
  });

  it("places between neighbors at their midpoint", () => {
    expect(rankScoreForPlacement(bucket, 1, "loved")).toBeCloseTo((9.5 + 8.0) / 2, 3);
    expect(rankScoreForPlacement(bucket, 2, "loved")).toBeCloseTo((8.0 + 7.0) / 2, 3);
  });

  it("places below the worst using the band min as sentinel", () => {
    expect(rankScoreForPlacement(bucket, 3, "loved")).toBeCloseTo((7.0 + 6.7) / 2, 3);
  });

  it("never fabricates scores outside the verdict band", () => {
    for (let index = 0; index <= bucket.length; index += 1) {
      const score = rankScoreForPlacement(bucket, index, "loved");
      expect(score).toBeGreaterThanOrEqual(VERDICT_BANDS.loved.min);
      expect(score).toBeLessThanOrEqual(VERDICT_BANDS.loved.max);
    }
  });
});

describe("opponentAdjustment", () => {
  it("nudges winners up and losers down", () => {
    const opponent = rankedRating(1, "loved", 7.5);
    expect(opponentAdjustment(opponent, true)?.rankScore).toBeCloseTo(7.55, 3);
    expect(opponentAdjustment(opponent, false)?.rankScore).toBeCloseTo(7.45, 3);
  });

  it("clamps nudges to the verdict band", () => {
    const top = rankedRating(1, "loved", 10);
    expect(opponentAdjustment(top, true)).toBeNull();
    const bottom = rankedRating(2, "loved", 6.7);
    expect(opponentAdjustment(bottom, false)).toBeNull();
  });

  it("ignores opponents without placement data", () => {
    expect(opponentAdjustment(rankedRating(1, "loved", null), true)).toBeNull();
  });
});
