import { describe, expect, it } from "vitest";
import { deriveTasteFacts } from "@/lib/taste";
import { buildSeenPrior, buildTasteTestQueue } from "@/lib/tasteTest";
import type { AppealSignal, Movie, MovieExposure, Rating } from "@/lib/types";

function movie(tmdbId: number, title: string, overrides: Partial<Movie> = {}): Movie {
  return {
    tmdbId,
    title,
    overview: `${title} overview with a tense mission and moral pressure.`,
    posterPath: "/poster.jpg",
    releaseDate: "2010-01-01",
    runtime: 110,
    voteAverage: 7.5,
    voteCount: 5000,
    popularity: 50,
    adult: false,
    genres: [{ id: 18, name: "Drama" }],
    keywords: ["mission"],
    countries: [],
    credits: { tmdbId, director: null, actors: [] },
    tasteFacts: [],
    ...overrides
  };
}

function rating(tmdbId: number, value: Rating["rating"]): Rating {
  return {
    profileId: "default",
    tmdbId,
    rating: value,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function exposure(tmdbId: number, source: MovieExposure["source"]): MovieExposure {
  return {
    id: `${source}-${tmdbId}`,
    profileId: "default",
    tmdbId,
    source,
    sourceDetail: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function appealSignal(tmdbId: number, signal: AppealSignal["signal"]): AppealSignal {
  return {
    profileId: "default",
    tmdbId,
    signal,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

const FULL_CONFIDENCE = 200;

describe("taste test queue", () => {
  it("excludes every rated movie and not seen movie", () => {
    const movies = [movie(1, "Liked"), movie(2, "Skipped"), movie(3, "Not Seen"), movie(4, "Available")];
    const queue = buildTasteTestQueue(
      movies,
      [rating(1, "like"), rating(2, "skip")],
      [exposure(3, "not_seen")],
      10
    );

    expect(queue.map((item) => item.tmdbId)).toEqual([4]);
  });

  it("excludes swiped movies (want to watch and pass) when appeal signals are provided", () => {
    const movies = [movie(1, "Watchlisted"), movie(2, "Passed"), movie(3, "Available")];
    const queue = buildTasteTestQueue(movies, [], [], 10, {
      appealSignals: [appealSignal(1, "want_to_watch"), appealSignal(2, "not_interested")]
    });

    expect(queue.map((item) => item.tmdbId)).toEqual([3]);
  });

  it("mixes model probes with coverage when the model is confident", () => {
    const frontierIds = Array.from({ length: 40 }, (_, i) => 1000 + i);
    const fillerIds = Array.from({ length: 160 }, (_, i) => 2000 + i);
    const movies = [
      ...frontierIds.map((id) => movie(id, `Frontier ${id}`)),
      ...fillerIds.map((id) => movie(id, `Filler ${id}`))
    ];
    const predictions = new Map<number, number>(frontierIds.map((id) => [id, 6.5]));

    const queue = buildTasteTestQueue(movies, [], [], 80, { predictions, modelRatingSampleCount: FULL_CONFIDENCE });
    const frontierCount = queue.filter((item) => frontierIds.includes(item.tmdbId)).length;
    const fillerCount = queue.filter((item) => fillerIds.includes(item.tmdbId)).length;

    expect(queue.length).toBe(80);
    // Weighted interleave: frontier probes take a meaningful share while
    // coverage keeps the deck from becoming pure exploitation.
    expect(frontierCount).toBeGreaterThanOrEqual(20);
    expect(fillerCount).toBeGreaterThanOrEqual(30);
  });

  it("ignores model probes entirely when the model has too little history", () => {
    const movies = Array.from({ length: 30 }, (_, i) => movie(100 + i, `Movie ${100 + i}`));
    // Predictions target movies deep in the coverage order, so pulling them
    // forward is only possible via the probe buckets.
    const predictions = new Map<number, number>([
      [125, 6.5],
      [128, 8.5]
    ]);

    const confident = buildTasteTestQueue(movies, [], [], 20, { predictions, modelRatingSampleCount: FULL_CONFIDENCE });
    const unconfident = buildTasteTestQueue(movies, [], [], 20, { predictions, modelRatingSampleCount: 0 });
    const noModel = buildTasteTestQueue(movies, [], [], 20);

    expect(unconfident.map((item) => item.tmdbId)).toEqual(noModel.map((item) => item.tmdbId));
    expect(confident.map((item) => item.tmdbId)).not.toEqual(noModel.map((item) => item.tmdbId));
  });

  it("caps believed-miss probes and keeps them sparse and out of coverage", () => {
    const missIds = Array.from({ length: 20 }, (_, i) => i + 1);
    const fillerIds = Array.from({ length: 120 }, (_, i) => 100 + i);
    const movies = [
      ...missIds.map((id) => movie(id, `Miss ${id}`)),
      ...fillerIds.map((id) => movie(id, `Filler ${id}`))
    ];
    const predictions = new Map<number, number>(missIds.map((id) => [id, 2]));
    const queue = buildTasteTestQueue(movies, [], [], 80, { predictions, modelRatingSampleCount: FULL_CONFIDENCE });

    const missCount = queue.filter((item) => missIds.includes(item.tmdbId)).length;
    expect(queue.length).toBe(80);
    // Sparse: present for calibration, but never more than 1-in-8 of the deck.
    expect(missCount).toBeGreaterThanOrEqual(1);
    expect(missCount).toBeLessThanOrEqual(10);
  });

  it("surfaces loved-neighborhood probes even without predictions", () => {
    const neighborIds = [11, 12];
    const movies = [
      ...neighborIds.map((id) => movie(id, `Neighbor ${id}`)),
      ...[21, 22, 23, 24, 25].map((id) => movie(id, `Filler ${id}`))
    ];
    const neighborhoodSimilarity = new Map<number, number>(neighborIds.map((id) => [id, 0.9]));

    const queue = buildTasteTestQueue(movies, [], [], 7, { neighborhoodSimilarity, modelRatingSampleCount: FULL_CONFIDENCE });
    const ids = queue.map((item) => item.tmdbId);

    expect(ids).toContain(11);
    expect(ids).toContain(12);
  });

  it("orders frontier probes by closeness to the frontier peak", () => {
    const movies = [movie(1, "Near Peak"), movie(2, "Far From Peak"), ...[3, 4, 5].map((id) => movie(id, `Filler ${id}`))];
    const predictions = new Map<number, number>([
      [1, 6.5],
      [2, 7.4]
    ]);

    const queue = buildTasteTestQueue(movies, [], [], 5, { predictions, modelRatingSampleCount: FULL_CONFIDENCE });
    const ids = queue.map((item) => item.tmdbId);

    expect(ids.indexOf(1)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
  });

  it("falls back to coverage ordering when the predictions map is empty", () => {
    const movies = [movie(1, "A"), movie(2, "B"), movie(3, "C")];
    const queue = buildTasteTestQueue(movies, [], [], 10, { predictions: new Map(), modelRatingSampleCount: FULL_CONFIDENCE });

    expect(queue.map((item) => item.tmdbId).sort()).toEqual([1, 2, 3]);
  });

  it("relaxes quality floors when the strict pool is exhausted", () => {
    // Strict floors require 500+ votes, 6.25+ average, 8+ popularity.
    const midTier = Array.from({ length: 12 }, (_, i) =>
      movie(300 + i, `Mid Tier ${i}`, { voteCount: 250, voteAverage: 6.0, popularity: 5 })
    );
    const strictOnly = [movie(1, "Mainstream Hit")];

    const queue = buildTasteTestQueue([...strictOnly, ...midTier], [], [], 12);
    const ids = queue.map((item) => item.tmdbId);

    expect(ids).toContain(1);
    expect(ids.filter((id) => id >= 300).length).toBeGreaterThanOrEqual(10);
  });

  it("keeps the strict queue when it already fills the deck", () => {
    const strict = Array.from({ length: 12 }, (_, i) => movie(i + 1, `Strict ${i}`));
    const midTier = Array.from({ length: 5 }, (_, i) =>
      movie(300 + i, `Mid Tier ${i}`, { voteCount: 250, voteAverage: 6.0, popularity: 5 })
    );

    const queue = buildTasteTestQueue([...strict, ...midTier], [], [], 12);
    expect(queue.every((item) => item.tmdbId < 300)).toBe(true);
  });

  it("does not treat low-value TMDB metadata tags as taste themes", () => {
    const facts = deriveTasteFacts({
      ...movie(10, "Metadata Noise"),
      keywords: ["aftercreditsstinger", "duringcreditsstinger", "based on comic", "orphan"]
    });

    expect(facts.map((fact) => `${fact.kind}:${fact.value}`)).not.toContain("theme:aftercreditsstinger");
    expect(facts.map((fact) => `${fact.kind}:${fact.value}`)).not.toContain("theme:duringcreditsstinger");
    expect(facts.map((fact) => `${fact.kind}:${fact.value}`)).toContain("theme:orphan");
  });

  it("infers reusable family, memory, and music taxonomy traits", () => {
    const facts = deriveTasteFacts({
      ...movie(11, "Family Music Story"),
      overview:
        "A boy dreams of becoming a musician despite his family's generations-old ban on music and journeys through the land of the dead to uncover his family legacy.",
      genres: [
        { id: 16, name: "Animation" },
        { id: 10751, name: "Family" }
      ],
      keywords: ["music", "family", "day of the dead", "tradition"]
    });
    const taxonomyTraits = facts.filter((fact) => fact.source === "taxonomy").map((fact) => fact.value);

    expect(taxonomyTraits).toContain("family_legacy");
    expect(taxonomyTraits).toContain("music_as_identity");
    expect(taxonomyTraits).toContain("memory_and_grief");
  });
});

describe("seen prior", () => {
  it("demotes decades and genres the user consistently has not seen", () => {
    const seenMovies = [1, 2, 3].map((id) =>
      movie(id, `Seen ${id}`, { releaseDate: "2012-01-01", genres: [{ id: 18, name: "Drama" }] })
    );
    const unseenMovies = [11, 12, 13].map((id) =>
      movie(id, `Unseen ${id}`, { releaseDate: "1962-01-01", genres: [{ id: 37, name: "Western" }] })
    );
    const byId = new Map([...seenMovies, ...unseenMovies].map((item) => [item.tmdbId, item]));

    const prior = buildSeenPrior(
      seenMovies.map((item) => rating(item.tmdbId, "like")),
      unseenMovies.map((item) => exposure(item.tmdbId, "not_seen")),
      [],
      byId
    );

    const likelySeen = movie(100, "Modern Drama", { releaseDate: "2014-01-01", genres: [{ id: 18, name: "Drama" }] });
    const likelyUnseen = movie(101, "Old Western", { releaseDate: "1965-01-01", genres: [{ id: 37, name: "Western" }] });

    expect(prior(likelySeen)).toBeGreaterThan(prior(likelyUnseen));
  });

  it("treats swiped-away movies as unseen evidence", () => {
    const seen = movie(1, "Seen Drama", { releaseDate: "2012-01-01", genres: [{ id: 18, name: "Drama" }] });
    const swiped = movie(2, "Swiped Horror", { releaseDate: "2012-01-01", genres: [{ id: 27, name: "Horror" }] });
    const byId = new Map([seen, swiped].map((item) => [item.tmdbId, item]));

    const prior = buildSeenPrior([rating(1, "like")], [], [appealSignal(2, "not_interested")], byId);

    const dramaCandidate = movie(100, "Drama Candidate", { releaseDate: "2015-01-01", genres: [{ id: 18, name: "Drama" }] });
    const horrorCandidate = movie(101, "Horror Candidate", { releaseDate: "2015-01-01", genres: [{ id: 27, name: "Horror" }] });

    expect(prior(dramaCandidate)).toBeGreaterThan(prior(horrorCandidate));
  });
});
