import { describe, expect, it } from "vitest";
import { buildSeenPrior, buildSeenProbability } from "@/lib/seenModel";
import type { AppealSignal, Movie, MovieExposure, Rating } from "@/lib/types";

function movie(tmdbId: number, overrides: Partial<Movie> = {}): Movie {
  return {
    tmdbId,
    title: `Movie ${tmdbId}`,
    overview: "Overview",
    posterPath: "/poster.jpg",
    releaseDate: "2010-01-01",
    runtime: 110,
    voteAverage: 7.5,
    voteCount: 5000,
    popularity: 50,
    adult: false,
    genres: [{ id: 18, name: "Drama" }],
    keywords: [],
    countries: [],
    credits: { tmdbId, director: null, actors: [] },
    tasteFacts: [],
    ...overrides
  };
}

function rating(tmdbId: number): Rating {
  return {
    profileId: "default",
    tmdbId,
    rating: "like",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function notSeen(tmdbId: number): MovieExposure {
  return {
    id: `not-seen-${tmdbId}`,
    profileId: "default",
    tmdbId,
    source: "not_seen",
    sourceDetail: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

/**
 * Synthetic user mirroring the observed production pattern: they have seen
 * high-vote 2000s dramas/thrillers and have not seen mid-vote newer horror.
 */
function buildHistory() {
  const seen = Array.from({ length: 40 }, (_, i) =>
    movie(1000 + i, {
      voteCount: 8000 + i * 300,
      popularity: 30,
      releaseDate: "2005-06-01",
      genres: [{ id: 18, name: "Drama" }]
    })
  );
  const unseen = Array.from({ length: 40 }, (_, i) =>
    movie(2000 + i, {
      voteCount: 3000 + i * 50,
      popularity: 12,
      releaseDate: "2015-06-01",
      genres: [{ id: 27, name: "Horror" }]
    })
  );
  const byId = new Map([...seen, ...unseen].map((item) => [item.tmdbId, item]));
  const ratings = seen.map((item) => rating(item.tmdbId));
  const exposures = unseen.map((item) => notSeen(item.tmdbId));
  return { byId, ratings, exposures, appealSignals: [] as AppealSignal[] };
}

describe("buildSeenProbability", () => {
  it("learns to separate the user's seen profile from their not-seen profile", () => {
    const { byId, ratings, exposures, appealSignals } = buildHistory();
    const probability = buildSeenProbability(ratings, exposures, appealSignals, byId);

    const familiar = movie(9001, {
      voteCount: 9000,
      popularity: 30,
      releaseDate: "2004-01-01",
      genres: [{ id: 18, name: "Drama" }]
    });
    const unfamiliar = movie(9002, {
      voteCount: 3200,
      popularity: 12,
      releaseDate: "2016-01-01",
      genres: [{ id: 27, name: "Horror" }]
    });

    expect(probability(familiar)).toBeGreaterThan(probability(unfamiliar));
    expect(probability(familiar)).toBeGreaterThan(0.6);
    expect(probability(unfamiliar)).toBeLessThan(0.45);
  });

  it("falls back to the heuristic prior with sparse labels", () => {
    const seen = movie(1, { voteCount: 9000 });
    const byId = new Map([[1, seen]]);
    const probability = buildSeenProbability([rating(1)], [], [], byId);
    const heuristic = buildSeenPrior([rating(1)], [], [], byId);

    const candidate = movie(50, { voteCount: 400, popularity: 6 });
    expect(probability(candidate)).toBeCloseTo(heuristic(candidate), 10);
  });

  it("gives higher probability to high-vote mainstream titles for a fresh user", () => {
    const probability = buildSeenProbability([], [], [], new Map());
    const blockbuster = movie(1, { voteCount: 30000, popularity: 80 });
    const obscure = movie(2, { voteCount: 600, popularity: 9 });

    expect(probability(blockbuster)).toBeGreaterThan(probability(obscure));
  });

  it("stays within [0, 1]", () => {
    const { byId, ratings, exposures } = buildHistory();
    const probability = buildSeenProbability(ratings, exposures, [], byId);
    for (const candidate of [movie(1, { voteCount: 1 }), movie(2, { voteCount: 500000, popularity: 500 })]) {
      const value = probability(candidate);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
