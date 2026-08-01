import { describe, expect, it } from "vitest";
import { latestRatingTimestamp, recommendationRunIsFresh } from "@/lib/recommendations";
import type { Rating, RecommendationRun } from "@/lib/types";

function rating(tmdbId: number, updatedAt: string): Rating {
  return {
    profileId: "default",
    tmdbId,
    rating: "like",
    verdict: "loved",
    rankScore: 8,
    createdAt: updatedAt,
    updatedAt
  };
}

function run(metadata: Record<string, unknown>, status = "ready"): RecommendationRun {
  return {
    id: "run-1",
    profileId: "default",
    promptVersion: "p",
    scoringVersion: "s",
    status: status as RecommendationRun["status"],
    baselineAverage: null,
    recommendationAverage: null,
    metadata,
    createdAt: "2026-08-01T00:00:00.000Z",
    items: []
  };
}

const ratings = [rating(1, "2026-07-01T00:00:00.000Z"), rating(2, "2026-07-15T12:00:00.000Z")];
const signature = { ratedCount: 2, latestRatingAt: "2026-07-15T12:00:00.000Z" };

describe("latestRatingTimestamp", () => {
  it("returns the newest updatedAt", () => {
    expect(latestRatingTimestamp(ratings)).toBe("2026-07-15T12:00:00.000Z");
    expect(latestRatingTimestamp([])).toBe("");
  });
});

describe("recommendationRunIsFresh", () => {
  it("reuses the run when nothing changed", () => {
    expect(recommendationRunIsFresh(run({ ...signature, mediaType: "movie", genreFilter: null }), ratings, "movie", null)).toBe(true);
  });

  it("regenerates when a new rating landed", () => {
    const grown = [...ratings, rating(3, "2026-07-20T00:00:00.000Z")];
    expect(recommendationRunIsFresh(run({ ...signature, mediaType: "movie", genreFilter: null }), grown, "movie", null)).toBe(false);
  });

  it("regenerates when an existing rating was updated in place", () => {
    const touched = [ratings[0], rating(2, "2026-07-16T00:00:00.000Z")];
    expect(recommendationRunIsFresh(run({ ...signature, mediaType: "movie", genreFilter: null }), touched, "movie", null)).toBe(false);
  });

  it("regenerates when media type or genre filter differ", () => {
    const fresh = run({ ...signature, mediaType: "movie", genreFilter: null });
    expect(recommendationRunIsFresh(fresh, ratings, "tv", null)).toBe(false);
    expect(recommendationRunIsFresh(fresh, ratings, "movie", 27)).toBe(false);

    const genreRun = run({ ...signature, mediaType: "movie", genreFilter: { id: 27, name: "Horror" } });
    expect(recommendationRunIsFresh(genreRun, ratings, "movie", 27)).toBe(true);
    expect(recommendationRunIsFresh(genreRun, ratings, "movie", null)).toBe(false);
  });

  it("treats legacy runs without a signature and fallback runs as stale", () => {
    expect(recommendationRunIsFresh(run({ ratedCount: 2 }), ratings, "movie", null)).toBe(false);
    expect(recommendationRunIsFresh(run({ ...signature, mediaType: "movie", genreFilter: null }, "fallback"), ratings, "movie", null)).toBe(false);
  });
});
