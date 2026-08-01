import { describe, expect, it, vi } from "vitest";
import { canonicalId, mediaTypeOfId, sourceIdOf, TV_ID_OFFSET } from "@/lib/mediaId";
import { resolveGenre } from "@/lib/genres";
import { beginPlacement } from "@/lib/rankingService";
import { deriveTasteFacts } from "@/lib/taste";
import { usableTasteTestMovie } from "@/lib/tasteTest";
import type { MovieStore } from "@/lib/store";
import type { Comparison, MediaType, Movie, Rating } from "@/lib/types";

function movie(tmdbId: number, overrides: Partial<Movie> = {}): Movie {
  return {
    tmdbId,
    title: `Title ${tmdbId}`,
    overview: "Overview text",
    posterPath: "/poster.jpg",
    releaseDate: "2015-01-01",
    runtime: 45,
    voteAverage: 7.8,
    voteCount: 5000,
    popularity: 40,
    adult: false,
    genres: [{ id: 18, name: "Drama" }],
    keywords: [],
    countries: [],
    credits: { tmdbId, director: null, actors: [] },
    tasteFacts: [],
    ...overrides
  };
}

describe("canonical media ids", () => {
  it("round-trips both media types", () => {
    expect(canonicalId("movie", 550)).toBe(550);
    expect(canonicalId("tv", 550)).toBe(TV_ID_OFFSET + 550);
    expect(sourceIdOf(550)).toBe(550);
    expect(sourceIdOf(TV_ID_OFFSET + 550)).toBe(550);
    expect(mediaTypeOfId(550)).toBe("movie");
    expect(mediaTypeOfId(TV_ID_OFFSET + 550)).toBe("tv");
  });

  it("keeps colliding TMDB ids distinct", () => {
    expect(canonicalId("movie", 550)).not.toBe(canonicalId("tv", 550));
  });
});

describe("TV genre resolution", () => {
  it("resolves TV genres against the TV taxonomy", () => {
    expect(resolveGenre("sci fi", "tv")?.name).toBe("Sci-Fi & Fantasy");
    expect(resolveGenre("action", "tv")?.name).toBe("Action & Adventure");
    expect(resolveGenre("reality", "tv")?.id).toBe(10764);
  });

  it("rejects movie-only genres in TV mode and keeps movie behavior intact", () => {
    expect(resolveGenre("horror", "tv")).toBeNull();
    expect(resolveGenre("horror", "movie")?.name).toBe("Horror");
    expect(resolveGenre("sci fi")?.name).toBe("Sci-Fi"); // default = movie
  });
});

describe("per-media deck calibration", () => {
  it("applies the TV vote floor instead of the movie floor", () => {
    const votes = 150; // above TV floor (100), below movie floor (500)
    const tvShow = movie(canonicalId("tv", 10), { mediaType: "tv", voteCount: votes, voteAverage: 7.5, popularity: 12 });
    const film = movie(10, { mediaType: "movie", voteCount: votes, voteAverage: 7.5, popularity: 12 });

    expect(usableTasteTestMovie(tvShow)).toBe(true);
    expect(usableTasteTestMovie(film)).toBe(false);
  });
});

describe("TV taste facts", () => {
  it("adds media and format facts for TV shows", () => {
    const limited = movie(canonicalId("tv", 20), {
      mediaType: "tv",
      sourcePayload: { number_of_seasons: 1, status: "Ended" }
    });
    const longRunner = movie(canonicalId("tv", 21), {
      mediaType: "tv",
      sourcePayload: { number_of_seasons: 9, status: "Returning Series" }
    });
    const film = movie(22);

    const limitedKeys = deriveTasteFacts(limited).map((fact) => `${fact.kind}:${fact.value}`);
    const longKeys = deriveTasteFacts(longRunner).map((fact) => `${fact.kind}:${fact.value}`);
    const filmKeys = deriveTasteFacts(film).map((fact) => `${fact.kind}:${fact.value}`);

    expect(limitedKeys).toContain("media:tv");
    expect(limitedKeys).toContain("format:limited_series");
    expect(longKeys).toContain("format:long_running_series");
    expect(filmKeys).not.toContain("media:tv");
  });
});

describe("cross-media comparison isolation", () => {
  function rating(tmdbId: number, rankScore: number): Rating {
    return {
      profileId: "default",
      tmdbId,
      rating: "like",
      verdict: "loved",
      rankScore,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
  }

  it("never offers a movie as opponent when placing a TV show", async () => {
    const tvId = canonicalId("tv", 99);
    const comparisons: Comparison[] = [
      { id: "c1", profileId: "default", winnerTmdbId: 1, loserTmdbId: 2, createdAt: "" },
      { id: "c2", profileId: "default", winnerTmdbId: canonicalId("tv", 5), loserTmdbId: canonicalId("tv", 6), createdAt: "" }
    ];
    const ratings = [
      rating(1, 9.1), // movies (comparison-confirmed)
      rating(2, 8.2),
      rating(canonicalId("tv", 5), 9.0), // tv (comparison-confirmed)
      rating(canonicalId("tv", 6), 7.4)
    ];
    const store = {
      listRatings: vi.fn(async () => ratings),
      listComparisons: vi.fn(async () => comparisons),
      upsertRating: vi.fn(async (tmdbId: number) => rating(tmdbId, 8.35))
    } as unknown as MovieStore;

    const { placement } = await beginPlacement(store, tvId, "loved");

    expect(placement.bucketSize).toBe(2); // only the two TV ratings
    expect([canonicalId("tv", 5), canonicalId("tv", 6)]).toContain(placement.opponentTmdbId);
  });
});

describe("media-filtered recommendations", () => {
  it("only recommends the requested media type", async () => {
    const { generateRecommendations } = await import("@/lib/recommendations");
    const fact = (tmdbId: number) => [{ tmdbId, kind: "tone" as const, value: "tense", weight: 1, source: "curated" as const }];
    const mediaTypeFor = (id: number): MediaType => (id >= TV_ID_OFFSET ? "tv" : "movie");
    const catalogue = [
      ...Array.from({ length: 10 }, (_, i) => movie(200 + i, { tasteFacts: fact(200 + i) })),
      ...Array.from({ length: 5 }, (_, i) => movie(300 + i, { tasteFacts: fact(300 + i) })),
      ...Array.from({ length: 5 }, (_, i) =>
        movie(canonicalId("tv", 400 + i), { mediaType: "tv", voteCount: 900, tasteFacts: fact(canonicalId("tv", 400 + i)) })
      )
    ].map((entry) => ({ ...entry, mediaType: entry.mediaType ?? mediaTypeFor(entry.tmdbId) }));
    const ratings = Array.from({ length: 10 }, (_, i) => ({
      profileId: "default",
      tmdbId: 200 + i,
      rating: (i < 4 ? "like" : "dislike") as Rating["rating"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }));

    const store = {
      listMovies: vi.fn(async () => catalogue),
      listRatings: vi.fn(async () => ratings),
      listRatingReasons: vi.fn(async () => []),
      listRatingTraitReasons: vi.fn(async () => []),
      listExposures: vi.fn(async () => []),
      listAppealSignals: vi.fn(async () => []),
      listWatchlist: vi.fn(async () => []),
      listHiddenRecommendations: vi.fn(async () => []),
      listMovieEmbeddings: vi.fn(async () => []),
      matchMovieEmbeddings: vi.fn(async () => []),
      logExposure: vi.fn(async () => undefined),
      saveRecommendationRun: vi.fn(async (input: { items: Array<Record<string, unknown>>; [key: string]: unknown }) => ({
        id: "run-1",
        profileId: "default",
        promptVersion: "p",
        scoringVersion: "s",
        status: "ready",
        baselineAverage: null,
        recommendationAverage: null,
        metadata: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        items: input.items.map((item, index) => ({
          ...item,
          id: `item-${index}`,
          runId: "run-1",
          profileId: "default",
          createdAt: "2026-01-01T00:00:00.000Z"
        }))
      }))
    } as unknown as MovieStore;

    const tvResult = await generateRecommendations(store, "default", 10, { mediaType: "tv" });
    expect(tvResult.ready).toBe(true);
    expect(tvResult.recommendations.length).toBeGreaterThan(0);
    for (const item of tvResult.recommendations) {
      expect(item.movie.mediaType).toBe("tv");
    }

    const movieResult = await generateRecommendations(store, "default", 10);
    expect(movieResult.recommendations.length).toBeGreaterThan(0);
    for (const item of movieResult.recommendations) {
      expect(item.movie.mediaType ?? "movie").toBe("movie");
    }
  });
});
