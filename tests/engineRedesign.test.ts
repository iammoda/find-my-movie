import { describe, expect, it } from "vitest";
import { genreConcentration, meanProbability, precisionAtK, rankingAuc } from "@/lib/engineMetrics";
import { assembleSlate, scoreCandidateWithModel, type ScoredCandidate } from "@/lib/recommendations";
import { buildTasteModes, type ModeSample } from "@/lib/tasteClusters";
import { nostalgiaDiscount, recencyDecay } from "@/lib/tasteModel";
import type { Movie, Rating, RecommendationScoreBreakdown } from "@/lib/types";

function movie(tmdbId: number, overrides: Partial<Movie> = {}): Movie {
  return {
    tmdbId,
    title: `Movie ${tmdbId}`,
    overview: "Overview",
    posterPath: "/poster.jpg",
    releaseDate: "2015-01-01",
    runtime: 110,
    voteAverage: 7.5,
    voteCount: 9000,
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

function rating(tmdbId: number, createdAt: string, rankScore = 9): Rating {
  return {
    profileId: "default",
    tmdbId,
    rating: "like",
    verdict: "loved",
    rankScore,
    createdAt,
    updatedAt: createdAt
  };
}

describe("engine metrics", () => {
  it("computes AUC, precision, flood and staleness", () => {
    expect(rankingAuc([3, 4], [1, 2])).toBe(1);
    expect(rankingAuc([1], [2])).toBe(0);
    expect(rankingAuc([], [1])).toBeNull();
    expect(
      precisionAtK(
        [
          { score: 3, positive: true },
          { score: 2, positive: false },
          { score: 1, positive: true }
        ],
        2
      )
    ).toBe(0.5);
    expect(genreConcentration([movie(1), movie(2), movie(3, { genres: [{ id: 35, name: "Comedy" }] })])).toBeCloseTo(2 / 3);
    expect(meanProbability([0.2, 0.4])).toBeCloseTo(0.3);
  });
});

describe("label hygiene", () => {
  const sessions = new Map([["2026-07-04T22", 30]]);
  const calmSessions = new Map([["2026-07-10T20", 3]]);

  it("discounts formative-era mega-popular comfort loves", () => {
    const shrek = movie(1, { releaseDate: "2001-05-16", voteCount: 30000, genres: [{ id: 16, name: "Animation" }, { id: 10751, name: "Family" }] });
    const loved = rating(1, "2026-07-04T22:05:00.000Z");
    expect(nostalgiaDiscount(shrek, loved, 0.9, sessions)).toBeCloseTo(0.35); // rapid session compounds
    expect(nostalgiaDiscount(shrek, rating(1, "2026-07-10T20:00:00.000Z"), 0.9, calmSessions)).toBeCloseTo(0.5);
  });

  it("leaves recent releases, non-comfort fare, and negative ratings at full weight", () => {
    const recent = movie(2, { releaseDate: "2024-05-01", voteCount: 30000, genres: [{ id: 16, name: "Animation" }] });
    expect(nostalgiaDiscount(recent, rating(2, "2026-07-04T22:05:00.000Z"), 0.9, sessions)).toBe(1);

    const oldThriller = movie(3, { releaseDate: "1995-01-01", voteCount: 30000, genres: [{ id: 53, name: "Thriller" }] });
    expect(nostalgiaDiscount(oldThriller, rating(3, "2026-07-04T22:05:00.000Z"), 0.9, sessions)).toBe(1);

    const shrek = movie(4, { releaseDate: "2001-05-16", voteCount: 30000, genres: [{ id: 16, name: "Animation" }] });
    expect(nostalgiaDiscount(shrek, rating(4, "2026-07-04T22:05:00.000Z"), -0.6, sessions)).toBe(1); // disliking nostalgia is informative
  });

  it("decays old verdicts with a one-year half-life", () => {
    expect(recencyDecay("2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z")).toBe(1);
    expect(recencyDecay("2025-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z")).toBeCloseTo(0.5, 1);
  });
});

describe("taste modes", () => {
  function modeSample(tmdbId: number, embedding: number[], weight: number, genre = "Drama"): ModeSample {
    return { movie: movie(tmdbId, { genres: [{ id: 1, name: genre }] }), rankScore: 9, embedding, weight };
  }

  it("splits distinct embedding groups and weights shares by discovery weight", () => {
    const comfort = Array.from({ length: 8 }, (_, i) => modeSample(100 + i, [1, 0.02 * i, 0, 0], 0.35, "Animation"));
    const thriller = Array.from({ length: 8 }, (_, i) => modeSample(200 + i, [0, 0, 1, 0.02 * i], 1, "Thriller"));

    const modes = buildTasteModes([...comfort, ...thriller], 4);

    expect(modes.length).toBe(2);
    // Discovery weighting: the full-weight thriller mode outranks the nostalgic one.
    expect(modes[0].memberIds.has(200)).toBe(true);
    expect(modes[0].share).toBeGreaterThan(modes[1].share);
    expect(modes[0].share + modes[1].share).toBeCloseTo(1);
  });
});

describe("assembleSlate", () => {
  function candidate(tmdbId: number, score: number, genres: Movie["genres"]): ScoredCandidate {
    return {
      movie: movie(tmdbId, { genres }),
      score,
      baselineScore: score,
      breakdown: { positiveTraitScore: 0, negativeTraitPenalty: 0, embeddingSimilarityScore: 0, qualityScore: 0, popularityScore: 0, noveltyScore: 0, diversityPenalty: 0, topTraits: [], avoidedTraits: [] } as unknown as RecommendationScoreBreakdown,
      explanation: "match"
    };
  }
  const animation = [{ id: 16, name: "Animation" }];
  const thriller = [{ id: 53, name: "Thriller" }];

  it("caps any single genre and labels picks with their mode", () => {
    const scored = [
      ...Array.from({ length: 6 }, (_, i) => candidate(1 + i, 10 - i * 0.1, animation)),
      ...Array.from({ length: 6 }, (_, i) => candidate(100 + i, 5 - i * 0.1, thriller))
    ];
    const animationEmbedding = (i: number) => [1, 0.01 * i, 0];
    const thrillerEmbedding = (i: number) => [0, 0.01 * i, 1];
    const candidateEmbeddings = new Map<number, number[]>([
      ...Array.from({ length: 6 }, (_, i) => [1 + i, animationEmbedding(i)] as const),
      ...Array.from({ length: 6 }, (_, i) => [100 + i, thrillerEmbedding(i)] as const)
    ]);
    const modes = [
      { label: "cozy animation", centroid: [1, 0, 0], share: 0.5, memberIds: new Set<number>(), exemplars: [] },
      { label: "tense thriller", centroid: [0, 0, 1], share: 0.5, memberIds: new Set<number>(), exemplars: [] }
    ];

    const slate = assembleSlate(scored, 6, { modes, candidateEmbeddings, lovedEmbeddings: [] });

    const animationCount = slate.filter((item) => item.movie.genres.some((genre) => genre.name === "Animation")).length;
    expect(animationCount).toBeLessThanOrEqual(3); // no flood despite animation owning the top scores
    expect(slate.some((item) => item.breakdown.tasteMode === "tense thriller")).toBe(true);
    expect(slate[0].explanation?.startsWith("For your")).toBe(true);
  });

  it("suppresses franchise near-duplicates of selected picks and of watched loves", () => {
    const base = [1, 0, 0];
    const twin = [0.999, 0.01, 0]; // near-identical
    const distinct = [0, 1, 0];
    const watchedTwin = [0, 0.999, 0.02];
    const scored = [candidate(1, 10, thriller), candidate(2, 9.9, thriller), candidate(3, 9.5, animation), candidate(4, 9.4, animation)];
    const candidateEmbeddings = new Map<number, number[]>([
      [1, base],
      [2, twin],
      [3, distinct],
      [4, [0, 0, 1]]
    ]);

    const slate = assembleSlate(scored, 3, { modes: [], candidateEmbeddings, lovedEmbeddings: [watchedTwin] });
    const ids = slate.map((item) => item.movie.tmdbId);

    expect(ids).toContain(1);
    expect(ids).not.toContain(2); // twin of a selected pick
    expect(ids).not.toContain(3); // twin of an already-watched love
    expect(ids).toContain(4);
  });

  it("exempts the explicitly filtered genre from the per-genre cap", () => {
    // A genre-filtered run: every candidate carries the focus genre. Without
    // the exemption the cap of 3 hard-limited the slate to exactly 3 items.
    const comedy = [{ id: 35, name: "Comedy" }];
    const scored = Array.from({ length: 12 }, (_, i) => candidate(1 + i, 10 - i * 0.1, comedy));
    // Orthogonal embeddings: distinct movies, not franchise near-duplicates.
    const oneHot = (i: number) => Array.from({ length: 16 }, (_, d) => (d === i ? 1 : 0));
    const candidateEmbeddings = new Map<number, number[]>(scored.map((item, i) => [item.movie.tmdbId, oneHot(i)]));

    const capped = assembleSlate(scored, 10, { modes: [], candidateEmbeddings, lovedEmbeddings: [] });
    expect(capped.length).toBe(3); // documented old behavior without a focus genre

    const slate = assembleSlate(scored, 10, { modes: [], candidateEmbeddings, lovedEmbeddings: [], focusGenreId: 35 });
    expect(slate.length).toBe(10);

    // Secondary genres are still capped on a focused run.
    const horrorComedy = [{ id: 35, name: "Comedy" }, { id: 27, name: "Horror" }];
    const mixed = [
      ...Array.from({ length: 6 }, (_, i) => candidate(50 + i, 10 - i * 0.1, horrorComedy)),
      ...Array.from({ length: 6 }, (_, i) => candidate(70 + i, 8 - i * 0.1, comedy))
    ];
    const mixedEmbeddings = new Map<number, number[]>(mixed.map((item, i) => [item.movie.tmdbId, oneHot(i)]));
    const mixedSlate = assembleSlate(mixed, 10, { modes: [], candidateEmbeddings: mixedEmbeddings, lovedEmbeddings: [], focusGenreId: 35 });
    const horrorCount = mixedSlate.filter((item) => item.movie.genres.some((genre) => genre.name === "Horror")).length;
    expect(horrorCount).toBeLessThanOrEqual(3);
    expect(mixedSlate.length).toBeGreaterThan(3);
  });
});

describe("scoreCandidateWithModel neighbor blend", () => {
  const model = {
    version: "test",
    embeddingDim: 3,
    traitVocab: [],
    traitIndex: new Map<string, number>(),
    weights: new Float64Array([0.1, 0.1, 0.1]),
    bias: 0,
    lambda: 8,
    gcv: 0,
    sampleCount: 20,
    ratingSampleCount: 20,
    embeddingDirection: [1, 0, 0]
  };

  it("lifts candidates that taste neighbors loved and records the evidence", () => {
    const target = movie(1);
    const plain = scoreCandidateWithModel(target, model, [0.1, 0.1, 0.1], new Set(), [], null, 0, null);
    const boosted = scoreCandidateWithModel(target, model, [0.1, 0.1, 0.1], new Set(), [], null, 0, { score: 9.2, support: 40 });

    expect(boosted.score).toBeGreaterThan(plain.score);
    expect(boosted.breakdown.neighborScore).toBeCloseTo(9.2);
    expect(boosted.breakdown.neighborSupport).toBe(40);
    expect(boosted.explanation).toContain("People who rate like you");
    // Display prediction moves toward the neighbor estimate with confidence.
    expect(boosted.breakdown.predictedRankScore!).toBeGreaterThan(plain.breakdown.predictedRankScore!);
  });

  it("drags candidates that taste neighbors disliked", () => {
    const target = movie(2);
    const plain = scoreCandidateWithModel(target, model, [0.1, 0.1, 0.1], new Set(), [], null, 0, null);
    const dragged = scoreCandidateWithModel(target, model, [0.1, 0.1, 0.1], new Set(), [], null, 0, { score: 2.4, support: 40 });
    expect(dragged.score).toBeLessThan(plain.score);
  });

  it("ignores thin neighbor evidence in the explanation", () => {
    const target = movie(3);
    const thin = scoreCandidateWithModel(target, model, [0.1, 0.1, 0.1], new Set(), [], null, 0, { score: 9.9, support: 3 });
    expect(thin.explanation).not.toContain("People who rate like you");
  });
});
