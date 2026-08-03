import { describe, expect, it } from "vitest";
import { SCORING_VERSION } from "@/lib/constants";
import {
  RUN_REUSE_MAX_AGE_MS,
  latestRatingTimestamp,
  recommendationRunIsFresh,
  recommendationRunIsReusable
} from "@/lib/recommendations";
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

function run(metadata: Record<string, unknown>, status = "ready", scoringVersion = SCORING_VERSION): RecommendationRun {
  return {
    id: "run-1",
    profileId: "default",
    promptVersion: "p",
    scoringVersion,
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

  it("regenerates runs produced by an older engine version", () => {
    const oldEngine = run({ ...signature, mediaType: "movie", genreFilter: null }, "ready", "learned-rank-v1");
    expect(recommendationRunIsFresh(oldEngine, ratings, "movie", null)).toBe(false);
    expect(recommendationRunIsReusable(oldEngine, ratings, "movie", null)).toBe(false);

    const coldStart = run({ ...signature, mediaType: "movie", genreFilter: null }, "ready", `${SCORING_VERSION}-legacy-coldstart`);
    expect(recommendationRunIsFresh(coldStart, ratings, "movie", null)).toBe(true);
  });
});

describe("recommendationRunIsReusable", () => {
  const now = new Date("2026-08-01T00:05:00.000Z").getTime(); // 5 minutes after run creation

  it("reuses a recent run despite a couple of new ratings, marked stale by freshness", () => {
    const stored = run({ ...signature, mediaType: "movie", genreFilter: null });
    const grown = [...ratings, rating(3, "2026-07-20T00:00:00.000Z"), rating(4, "2026-07-21T00:00:00.000Z")];
    expect(recommendationRunIsFresh(stored, grown, "movie", null)).toBe(false);
    expect(recommendationRunIsReusable(stored, grown, "movie", null, now)).toBe(true);
  });

  it("regenerates once enough new ratings landed or the run has aged out", () => {
    const stored = run({ ...signature, mediaType: "movie", genreFilter: null });
    const grownPastLimit = [
      ...ratings,
      rating(3, "2026-07-20T00:00:00.000Z"),
      rating(4, "2026-07-21T00:00:00.000Z"),
      rating(5, "2026-07-22T00:00:00.000Z")
    ];
    expect(recommendationRunIsReusable(stored, grownPastLimit, "movie", null, now)).toBe(false);

    const grown = [...ratings, rating(3, "2026-07-20T00:00:00.000Z")];
    const aged = new Date("2026-08-01T00:00:00.000Z").getTime() + RUN_REUSE_MAX_AGE_MS + 1;
    expect(recommendationRunIsReusable(stored, grown, "movie", null, aged)).toBe(false);
  });

  it("regenerates when ratings were deleted", () => {
    const stored = run({ ...signature, mediaType: "movie", genreFilter: null });
    expect(recommendationRunIsReusable(stored, [ratings[0]], "movie", null, now)).toBe(false);
  });
});
