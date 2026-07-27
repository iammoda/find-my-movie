import { describe, expect, it } from "vitest";
import {
  buildScoreCalibrator,
  buildTasteSamples,
  fitTasteModel,
  predictTasteScore,
  predictedRankScore,
  type TasteModel
} from "@/lib/tasteModel";
import type { AppealSignal, Movie, MovieExposure, Rating, TasteFact, Verdict, WatchlistItem } from "@/lib/types";

let idCounter = 1000;

function movie(tmdbId: number, traits: Array<{ kind: TasteFact["kind"]; value: string; source?: TasteFact["source"] }>): Movie {
  return {
    tmdbId,
    title: `Movie ${tmdbId}`,
    overview: "",
    posterPath: "/poster.jpg",
    voteAverage: 7.5,
    voteCount: 2000,
    popularity: 40,
    adult: false,
    genres: [],
    keywords: [],
    countries: [],
    tasteFacts: traits.map((trait) => ({
      tmdbId,
      kind: trait.kind,
      value: trait.value,
      weight: 1,
      source: trait.source ?? "taxonomy"
    }))
  };
}

function rating(tmdbId: number, verdict: Verdict, rankScore: number): Rating {
  idCounter += 1;
  return {
    profileId: "default",
    tmdbId,
    rating: verdict === "loved" ? "like" : verdict === "disliked" ? "dislike" : "skip",
    verdict,
    rankScore,
    createdAt: new Date(2024, 0, idCounter % 900).toISOString(),
    updatedAt: new Date(2024, 0, idCounter % 900).toISOString()
  };
}

function embeddingFor(direction: 1 | -1, dim = 8, noiseSeed = 0): number[] {
  const vector = new Array(dim).fill(0);
  vector[0] = direction;
  vector[1] = ((noiseSeed % 5) - 2) * 0.05;
  return vector;
}

describe("buildTasteSamples", () => {
  const movies = [
    movie(1, [{ kind: "tone", value: "slow-burn dread" }]),
    movie(2, [{ kind: "tone", value: "warm feel-good" }]),
    movie(3, [{ kind: "tone", value: "warm feel-good" }])
  ];

  it("uses continuous rank scores as targets", () => {
    const samples = buildTasteSamples(movies, [rating(1, "loved", 9.0)], [], [], new Map());
    expect(samples).toHaveLength(1);
    expect(samples[0].y).toBeCloseTo(0.8, 5);
    expect(samples[0].kind).toBe("rating");
  });

  it("falls back to legacy seeds when rank scores are missing", () => {
    const legacy: Rating = { ...rating(1, "loved", 0), verdict: null, rankScore: null, rating: "best_ever" };
    const samples = buildTasteSamples(movies, [legacy], [], [], new Map());
    expect(samples[0].y).toBeCloseTo((9.5 - 5) / 5, 5);
  });

  it("turns appeal signals into weak samples, skipping rated movies", () => {
    const signals: AppealSignal[] = [
      { profileId: "default", tmdbId: 2, signal: "not_interested", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      { profileId: "default", tmdbId: 1, signal: "want_to_watch", createdAt: "2024-01-01", updatedAt: "2024-01-01" }
    ];
    const samples = buildTasteSamples(movies, [rating(1, "loved", 9)], [], signals, new Map());
    const appeal = samples.filter((sample) => sample.kind === "appeal");
    expect(appeal).toHaveLength(1);
    expect(appeal[0].tmdbId).toBe(2);
    expect(appeal[0].y).toBeLessThan(0);
    expect(appeal[0].weight).toBeLessThan(0.5);
  });

  it("treats repeated ignored impressions as soft negatives", () => {
    const exposures: MovieExposure[] = [1, 2, 3, 4].map((index) => ({
      id: `exp-${index}`,
      profileId: "default",
      tmdbId: 3,
      source: "taste_test",
      createdAt: `2024-01-0${index}`
    }));
    const samples = buildTasteSamples(movies, [rating(1, "loved", 9)], exposures, [], new Map());
    const impressions = samples.filter((sample) => sample.kind === "impression");
    expect(impressions).toHaveLength(1);
    expect(impressions[0].tmdbId).toBe(3);
    expect(impressions[0].y).toBeLessThan(0);
  });

  it("treats abandoned watchlist items as weak negatives", () => {
    const watchlist: WatchlistItem[] = [
      { profileId: "default", tmdbId: 2, status: "abandoned", addedAt: "2024-01-01", resolvedAt: "2024-01-02" },
      { profileId: "default", tmdbId: 3, status: "queued", addedAt: "2024-01-01", resolvedAt: null }
    ];
    const samples = buildTasteSamples(movies, [rating(1, "loved", 9)], [], [], new Map(), watchlist);
    const abandoned = samples.filter((sample) => sample.tmdbId === 2);
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].y).toBeLessThan(0);
    // Queued (not abandoned) items produce no sample.
    expect(samples.some((sample) => sample.tmdbId === 3)).toBe(false);
  });
});

describe("fitTasteModel", () => {
  it("returns null without enough graded history", () => {
    const movies = [movie(1, [{ kind: "tone", value: "slow-burn dread" }])];
    const samples = buildTasteSamples(movies, [rating(1, "loved", 9)], [], [], new Map());
    expect(fitTasteModel(samples)).toBeNull();
  });

  it("learns a discriminative embedding direction", () => {
    const movies: Movie[] = [];
    const ratings: Rating[] = [];
    const embeddings = new Map<number, number[]>();

    for (let index = 0; index < 12; index += 1) {
      const likedId = 100 + index;
      movies.push(movie(likedId, [{ kind: "tone", value: "slow-burn dread" }]));
      ratings.push(rating(likedId, "loved", 8.5));
      embeddings.set(likedId, embeddingFor(1, 8, index));

      const dislikedId = 200 + index;
      movies.push(movie(dislikedId, [{ kind: "tone", value: "warm feel-good" }]));
      ratings.push(rating(dislikedId, "disliked", 2.0));
      embeddings.set(dislikedId, embeddingFor(-1, 8, index));
    }

    const samples = buildTasteSamples(movies, ratings, [], [], embeddings);
    const model = fitTasteModel(samples);
    expect(model).not.toBeNull();

    const likedProbe = predictTasteScore(model!, embeddingFor(1), movie(999, []));
    const dislikedProbe = predictTasteScore(model!, embeddingFor(-1), movie(998, []));
    expect(likedProbe.score).toBeGreaterThan(dislikedProbe.score);
    expect(predictedRankScore(likedProbe)).toBeGreaterThan(6);
    expect(predictedRankScore(dislikedProbe)).toBeLessThan(4.5);

    expect(model!.embeddingDirection).not.toBeNull();
    expect(model!.embeddingDirection![0]).toBeGreaterThan(0.5);
  });

  it("washes out traits shared by likes and dislikes, keeps discriminative ones", () => {
    const movies: Movie[] = [];
    const ratings: Rating[] = [];

    for (let index = 0; index < 12; index += 1) {
      const likedId = 300 + index;
      movies.push(
        movie(likedId, [
          { kind: "genre", value: "crime", source: "tmdb" },
          { kind: "tone", value: "slow-burn dread" }
        ])
      );
      ratings.push(rating(likedId, "loved", 8.5));

      const dislikedId = 400 + index;
      movies.push(
        movie(dislikedId, [
          { kind: "genre", value: "crime", source: "tmdb" },
          { kind: "tone", value: "warm feel-good" }
        ])
      );
      ratings.push(rating(dislikedId, "disliked", 2.5));
    }

    const samples = buildTasteSamples(movies, ratings, [], [], new Map());
    const model = fitTasteModel(samples);
    expect(model).not.toBeNull();

    const sharedIndex = model!.traitIndex.get("genre:crime");
    const likedIndex = model!.traitIndex.get("tone:slow-burn dread");
    const dislikedIndex = model!.traitIndex.get("tone:warm feel-good");
    expect(sharedIndex).toBeDefined();
    expect(likedIndex).toBeDefined();
    expect(dislikedIndex).toBeDefined();

    const sharedWeight = Math.abs(model!.weights[model!.embeddingDim + sharedIndex!]);
    const likedWeight = model!.weights[model!.embeddingDim + likedIndex!];
    const dislikedWeight = model!.weights[model!.embeddingDim + dislikedIndex!];

    expect(likedWeight).toBeGreaterThan(0);
    expect(dislikedWeight).toBeLessThan(0);
    expect(sharedWeight).toBeLessThan(likedWeight * 0.25);
    expect(sharedWeight).toBeLessThan(Math.abs(dislikedWeight) * 0.25);

    const likedProbe = predictTasteScore(model!, null, movie(997, [
      { kind: "genre", value: "crime", source: "tmdb" },
      { kind: "tone", value: "slow-burn dread" }
    ]));
    const dislikedProbe = predictTasteScore(model!, null, movie(996, [
      { kind: "genre", value: "crime", source: "tmdb" },
      { kind: "tone", value: "warm feel-good" }
    ]));
    expect(likedProbe.score).toBeGreaterThan(dislikedProbe.score);
    expect(likedProbe.topTraits.map((trait) => trait.key)).toContain("tone:slow-burn dread");
    expect(dislikedProbe.avoidedTraits.map((trait) => trait.key)).toContain("tone:warm feel-good");
  });
});

describe("buildScoreCalibrator", () => {
  // Minimal deterministic model: prediction.score = 0.2 * embedding[0], so
  // raw predicted rank = embedding[0] + 5.
  const fakeModel: TasteModel = {
    version: "test",
    embeddingDim: 1,
    traitVocab: [],
    traitIndex: new Map(),
    weights: Float64Array.from([0.2]),
    bias: 0,
    lambda: 1,
    gcv: 0,
    sampleCount: 24,
    ratingSampleCount: 24,
    embeddingDirection: [1]
  };

  function calibrationSamples(count: number) {
    return Array.from({ length: count }, (_, i) => {
      const spread = count > 1 ? i / (count - 1) : 0.5; // 0..1
      return {
        movie: movie(500 + i, []),
        embedding: [spread * 4 - 2], // raw predictions 3..7 - a shrunk band
        actualRankScore: 0.5 + spread * 9.3 // actual ranks 0.5..9.8
      };
    });
  }

  it("returns null with too few samples", () => {
    expect(buildScoreCalibrator(fakeModel, calibrationSamples(10))).toBeNull();
  });

  it("is monotone and stretches the shrunk band to the user's scale", () => {
    const calibrate = buildScoreCalibrator(fakeModel, calibrationSamples(24));
    expect(calibrate).not.toBeNull();

    const low = calibrate!(3);
    const mid = calibrate!(5);
    const high = calibrate!(7);

    expect(low).toBeLessThanOrEqual(mid);
    expect(mid).toBeLessThanOrEqual(high);
    // The model's ceiling (raw 7) should display near the user's own ceiling.
    expect(high).toBeGreaterThan(9);
    // And the floor near their floor.
    expect(low).toBeLessThan(2);
  });

  it("clamps predictions outside the training band", () => {
    const calibrate = buildScoreCalibrator(fakeModel, calibrationSamples(24))!;
    expect(calibrate(9.9)).toBeLessThanOrEqual(10);
    expect(calibrate(9.9)).toBeGreaterThanOrEqual(calibrate(7));
    expect(calibrate(0)).toBeGreaterThanOrEqual(0);
    expect(calibrate(0)).toBeLessThanOrEqual(calibrate(3));
  });
});
