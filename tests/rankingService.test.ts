import { describe, expect, it, vi } from "vitest";
import { bandMidpoint } from "@/lib/ranking";
import { advancePlacement, beginPlacement } from "@/lib/rankingService";
import type { MovieStore } from "@/lib/store";
import type { Comparison, Rating, Verdict } from "@/lib/types";

let counter = 0;

function rating(tmdbId: number, verdict: Verdict, rankScore: number): Rating {
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

function comparison(winnerTmdbId: number, loserTmdbId: number): Comparison {
  return { id: `${winnerTmdbId}-${loserTmdbId}`, profileId: "default", winnerTmdbId, loserTmdbId, createdAt: "2026-01-01T00:00:00.000Z" };
}

function mockStore(ratings: Rating[], comparisons: Comparison[]) {
  return {
    listRatings: vi.fn(async () => ratings),
    listComparisons: vi.fn(async () => comparisons),
    upsertRating: vi.fn(async (tmdbId: number, value: Rating["rating"], _profileId?: string, options?: { verdict?: Verdict; rankScore?: number }) =>
      rating(tmdbId, options?.verdict ?? "fine", options?.rankScore ?? 5)
    ),
    updateRatingRanks: vi.fn(async () => undefined),
    addComparison: vi.fn(async () => undefined)
  } as unknown as MovieStore & {
    addComparison: ReturnType<typeof vi.fn>;
    upsertRating: ReturnType<typeof vi.fn>;
  };
}

describe("placement opponent eligibility", () => {
  it("never offers unconfirmed midpoint rows (possibly unseen movies) as opponents", async () => {
    const midpoint = bandMidpoint("fine");
    const store = mockStore(
      [
        rating(1, "fine", midpoint), // migrated legacy skip: never compared, still at seed
        rating(2, "fine", 5.6), // confirmed by a moved score
        rating(3, "fine", 4.4) // confirmed by comparison participation below
      ],
      [comparison(3, 42)]
    );

    const { placement } = await beginPlacement(store, 99, "fine");

    expect(placement.bucketSize).toBe(2); // row 1 excluded
    expect(placement.opponentTmdbId).not.toBe(1);
    expect([2, 3]).toContain(placement.opponentTmdbId);
  });
});

describe("advancePlacement replay by id", () => {
  it("skips steps whose opponent vanished (e.g. deleted via haven't-seen) without burning a round", async () => {
    const store = mockStore(
      [rating(99, "fine", bandMidpoint("fine")), rating(2, "fine", 5.6), rating(3, "fine", 4.4)],
      [comparison(2, 41), comparison(3, 42)]
    );

    // Opponent 77 was deleted between requests; its step must not narrow bounds.
    const { placement, rating: finalRating } = await advancePlacement(store, 99, [{ opponentTmdbId: 77, preferredNew: true }]);

    expect(finalRating).toBeNull(); // placement continues
    expect(placement.done).toBe(false);
    expect(placement.round).toBe(0); // vanished step consumed no round
    expect([2, 3]).toContain(placement.opponentTmdbId);
    expect(store.addComparison).not.toHaveBeenCalled(); // nothing real to record
  });

  it("resolves opponents by id, recording the comparison against the movie actually shown", async () => {
    const store = mockStore(
      [rating(99, "fine", bandMidpoint("fine")), rating(2, "fine", 5.6), rating(3, "fine", 4.4)],
      [comparison(2, 41), comparison(3, 42)]
    );

    // Bucket best-first is [2, 3]; user lost to opponent 2 (index 0).
    const { placement } = await advancePlacement(store, 99, [{ opponentTmdbId: 2, preferredNew: false }]);

    expect(store.addComparison).toHaveBeenCalledWith(2, 99, undefined);
    // preferredNew=false at index 0 -> bounds {lo:1, hi:2} -> next opponent is 3.
    expect(placement.done).toBe(false);
    expect(placement.opponentTmdbId).toBe(3);
    expect(placement.round).toBe(1);
  });
});
