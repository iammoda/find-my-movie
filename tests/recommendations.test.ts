import { describe, expect, it, vi } from "vitest";
import { buildTasteProfile, generateRecommendations, scoreMovieCandidate } from "@/lib/recommendations";
import type { MovieStore } from "@/lib/store";
import type { Movie, MovieExposure, Rating, RatingTraitReason, RecommendationItem, RecommendationRun, TasteFact } from "@/lib/types";

function fact(tmdbId: number, kind: TasteFact["kind"], value: string, weight = 1, source: TasteFact["source"] = "curated"): TasteFact {
  return { tmdbId, kind, value, weight, source };
}

function movie(tmdbId: number, title: string, facts: TasteFact[], genres: Movie["genres"] = []): Movie {
  return {
    tmdbId,
    title,
    overview: `${title} overview`,
    posterPath: "/poster.jpg",
    releaseDate: "2010-01-01",
    runtime: 110,
    voteAverage: 7.5,
    voteCount: 2000,
    popularity: 35,
    adult: false,
    genres,
    keywords: [],
    countries: [],
    credits: { tmdbId, director: null, actors: [] },
    tasteFacts: facts
  };
}

function rating(tmdbId: number, value: Rating["rating"]): Rating {
  return {
    profileId: "default",
    tmdbId,
    rating: value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function profileScoreTotal(map: Map<string, { score: number }>) {
  return [...map.values()].reduce((sum, signal) => sum + signal.score, 0);
}

describe("recommendation scoring", () => {
  it("does not let one-off shallow Argo-style overlap beat deeper shared taste", () => {
    const argo = movie(1, "Argo", [
      fact(1, "tone", "tense"),
      fact(1, "structure", "procedural problem-solving"),
      fact(1, "stakes", "real-world stakes"),
      fact(1, "theme", "deception and identity"),
      fact(1, "setting", "IR"),
      fact(1, "genre", "Thriller")
    ]);
    const profile = buildTasteProfile([argo], [rating(1, "like")]);

    const shallowCountryMatch = movie(
      2,
      "Generic Regional War Thriller",
      [fact(2, "setting", "IR"), fact(2, "genre", "Thriller"), fact(2, "theme", "war", 0.7)],
      [{ id: 53, name: "Thriller" }]
    );
    const deeperStructureMatch = movie(
      3,
      "Pressure Operation",
      [
        fact(3, "tone", "tense"),
        fact(3, "structure", "procedural problem-solving"),
        fact(3, "stakes", "real-world stakes")
      ],
      [{ id: 18, name: "Drama" }]
    );

    const shallowScore = scoreMovieCandidate(shallowCountryMatch, profile, new Set()).score;
    const deepScore = scoreMovieCandidate(deeperStructureMatch, profile, new Set()).score;

    expect(deepScore).toBeGreaterThan(shallowScore);
  });

  it("penalizes traits connected to hate", () => {
    const hated = movie(10, "Hated Gore", [fact(10, "tone", "gory"), fact(10, "theme", "cruelty")]);
    const liked = movie(11, "Liked Puzzle", [fact(11, "structure", "layered puzzle")]);
    const profile = buildTasteProfile([hated, liked], [rating(10, "hate"), rating(11, "best_ever")]);

    const candidate = movie(12, "Another Gore Story", [fact(12, "tone", "gory"), fact(12, "structure", "layered puzzle")]);
    const score = scoreMovieCandidate(candidate, profile, new Set());

    expect(score.breakdown.negativeTraitPenalty).toBeGreaterThan(0);
    expect(score.breakdown.avoidedTraits).toContain("tone:gory");
  });

  it("weights searched favorites more heavily than broad top-rated likes", () => {
    const searchedFavorite = movie(20, "Searched Favorite", [fact(20, "theme", "obsessive ambition")]);
    const broadTopRatedLike = movie(21, "Broad Top Rated Like", [fact(21, "theme", "cosmic wonder")]);
    const exposures: MovieExposure[] = [
      {
        id: "manual",
        profileId: "default",
        tmdbId: 20,
        source: "manual_search",
        sourceDetail: null,
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "top-rated",
        profileId: "default",
        tmdbId: 21,
        source: "top_rated",
        sourceDetail: null,
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    const profile = buildTasteProfile([searchedFavorite, broadTopRatedLike], [rating(20, "like"), rating(21, "like")], exposures);

    expect(profile.positive.get("theme:obsessive ambition")?.score).toBeGreaterThan(profile.positive.get("theme:cosmic wonder")?.score ?? 0);
  });

  it("does not let embedding similarity override a strong hated trait", () => {
    const hated = movie(40, "Hated Cruel Story", [fact(40, "tone", "cruel")]);
    const profile = buildTasteProfile([hated], [rating(40, "hate")]);

    const hatedTraitCandidate = movie(41, "Similar But Cruel", [fact(41, "tone", "cruel")]);
    const neutralCandidate = movie(42, "Neutral Craft Movie", [fact(42, "structure", "procedural problem-solving")]);

    const badScore = scoreMovieCandidate(hatedTraitCandidate, profile, new Set(), { embeddingSimilarity: 1 }).score;
    const neutralScore = scoreMovieCandidate(neutralCandidate, profile, new Set(), { embeddingSimilarity: 0 }).score;

    expect(neutralScore).toBeGreaterThan(badScore);
  });

  it("discounts conflicted traits that appear in both likes and dislikes", () => {
    const liked = movie(50, "Liked Real Stakes", [fact(50, "stakes", "real-world stakes")]);
    const disliked = movie(51, "Disliked Real Stakes", [fact(51, "stakes", "real-world stakes")]);
    const cleanLike = movie(52, "Liked Puzzle", [fact(52, "structure", "layered puzzle")]);
    const profile = buildTasteProfile([liked, disliked, cleanLike], [rating(50, "like"), rating(51, "hate"), rating(52, "like")]);

    const conflictedCandidate = movie(53, "More Real Stakes", [fact(53, "stakes", "real-world stakes")]);
    const cleanCandidate = movie(54, "More Puzzle", [fact(54, "structure", "layered puzzle")]);

    const conflictedScore = scoreMovieCandidate(conflictedCandidate, profile, new Set());
    const cleanScore = scoreMovieCandidate(cleanCandidate, profile, new Set());

    expect(cleanScore.score).toBeGreaterThan(conflictedScore.score);
    expect(conflictedScore.breakdown.negativeTraitPenalty).toBeGreaterThan(0);
  });

  it("uses taxonomy traits as stronger evidence than genre overlap", () => {
    const favorite = movie(60, "Favorite Pressure Thriller", [
      fact(60, "structure", "procedural_unraveling", 1, "taxonomy"),
      fact(60, "theme", "moral_compromise", 1, "taxonomy"),
      fact(60, "genre", "Thriller", 0.65)
    ]);
    const profile = buildTasteProfile([favorite], [rating(60, "best_ever")]);

    const taxonomyMatch = movie(61, "Different Genre Same Qualities", [
      fact(61, "structure", "procedural_unraveling", 1, "taxonomy"),
      fact(61, "theme", "moral_compromise", 1, "taxonomy")
    ]);
    const genreOnly = movie(62, "Generic Thriller", [fact(62, "genre", "Thriller", 0.65)]);

    expect(scoreMovieCandidate(taxonomyMatch, profile, new Set()).score).toBeGreaterThan(scoreMovieCandidate(genreOnly, profile, new Set()).score);
  });

  it("reason feedback boosts matching facets", () => {
    const favorite = movie(70, "Favorite Character Movie", [
      fact(70, "protagonist", "competent_professional_under_pressure", 1, "taxonomy"),
      fact(70, "tone", "paranoid_investigation", 1, "taxonomy")
    ]);
    const profile = buildTasteProfile(
      [favorite],
      [rating(70, "best_ever")],
      [],
      [
        {
          id: "reason-1",
          profileId: "default",
          tmdbId: 70,
          reason: "character",
          sentiment: "positive",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    );

    expect(profile.positive.get("protagonist:competent_professional_under_pressure")?.score ?? 0).toBeGreaterThan(
      profile.positive.get("tone:paranoid_investigation")?.score ?? 0
    );
  });

  it("discounts taxonomy traits that are too common across the catalog", () => {
    const common = "revenge_engine";
    const rare = "procedural_unraveling";
    const favorite = movie(80, "Favorite With Specific Craft", [
      fact(80, "conflict", common, 1, "taxonomy"),
      fact(80, "structure", rare, 1, "taxonomy")
    ]);
    const commonCandidate = movie(81, "Common Trait Candidate", [fact(81, "conflict", common, 1, "taxonomy")]);
    const rareCandidate = movie(82, "Rare Trait Candidate", [fact(82, "structure", rare, 1, "taxonomy")]);
    const commonFillers = Array.from({ length: 30 }, (_, index) =>
      movie(100 + index, `Common Filler ${index}`, [fact(100 + index, "conflict", common, 1, "taxonomy")])
    );
    const allMovies = [favorite, commonCandidate, rareCandidate, ...commonFillers];
    const profile = buildTasteProfile(allMovies, [rating(80, "like")]);

    const commonScore = scoreMovieCandidate(commonCandidate, profile, new Set()).score;
    const rareScore = scoreMovieCandidate(rareCandidate, profile, new Set()).score;

    expect(rareScore).toBeGreaterThan(commonScore);
  });

  it("uses selected taxonomy trait reasons as exact stronger evidence", () => {
    const favorite = movie(140, "Favorite With Chosen Trait", [
      fact(140, "pacing", "propulsive_momentum", 1, "taxonomy"),
      fact(140, "theme", "moral_compromise", 1, "taxonomy")
    ]);
    const selectedReasons: RatingTraitReason[] = [
      {
        id: "trait-reason-1",
        profileId: "default",
        tmdbId: 140,
        traitId: "propulsive_momentum",
        sentiment: "positive",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
    const profile = buildTasteProfile([favorite], [rating(140, "like")], [], [], selectedReasons);

    const selectedMatch = movie(141, "Selected Trait Match", [fact(141, "pacing", "propulsive_momentum", 1, "taxonomy")]);
    const unselectedMatch = movie(142, "Unselected Trait Match", [fact(142, "theme", "moral_compromise", 1, "taxonomy")]);

    expect(scoreMovieCandidate(selectedMatch, profile, new Set()).score).toBeGreaterThan(scoreMovieCandidate(unselectedMatch, profile, new Set()).score);
  });

  it("uses selected trait reasons to redistribute rather than amplify rating evidence", () => {
    const favorite = movie(150, "Favorite With Focused Trait", [
      fact(150, "pacing", "kinetic_chase_escalation", 1, "taxonomy"),
      fact(150, "theme", "moral_compromise", 1, "taxonomy")
    ]);
    const selectedReasons: RatingTraitReason[] = [
      {
        id: "trait-reason-2",
        profileId: "default",
        tmdbId: 150,
        traitId: "kinetic_chase_escalation",
        sentiment: "positive",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    const plainProfile = buildTasteProfile([favorite], [rating(150, "best_ever")]);
    const focusedProfile = buildTasteProfile([favorite], [rating(150, "best_ever")], [], [], selectedReasons);

    expect(profileScoreTotal(focusedProfile.positive)).toBeCloseTo(profileScoreTotal(plainProfile.positive), 5);
    expect(focusedProfile.positive.get("pacing:kinetic_chase_escalation")?.score ?? 0).toBeGreaterThan(
      plainProfile.positive.get("pacing:kinetic_chase_escalation")?.score ?? 0
    );
    expect(focusedProfile.positive.get("theme:moral_compromise")?.score ?? 0).toBeLessThan(
      plainProfile.positive.get("theme:moral_compromise")?.score ?? 0
    );
  });
});

describe("generateRecommendations familiarity guarantees", () => {
  it("caps obscure picks even when they outscore familiar ones", async () => {
    // Obscure candidates carry a higher vote average, which outscores the
    // familiar ones on quality alone - the cap must still bound them.
    const ratedMovies = Array.from({ length: 10 }, (_, index) =>
      movie(200 + index, `Rated Movie ${index}`, [fact(200 + index, "tone", "tense")], [{ id: 18, name: "Drama" }])
    );
    const obscureCandidates = Array.from({ length: 10 }, (_, index) => ({
      ...movie(300 + index, `Obscure Gem ${index}`, [fact(300 + index, "tone", "tense")], [{ id: 18, name: "Drama" }]),
      voteCount: 2000,
      voteAverage: 8.5
    }));
    const familiarCandidates = Array.from({ length: 10 }, (_, index) => ({
      ...movie(400 + index, `Familiar Hit ${index}`, [fact(400 + index, "tone", "tense")], [{ id: 18, name: "Drama" }]),
      voteCount: 20000,
      voteAverage: 7.0
    }));
    const ratings = ratedMovies.map((rated, index) => rating(rated.tmdbId, index < 4 ? "like" : "dislike"));

    const store = {
      listMovies: vi.fn(async () => [...ratedMovies, ...obscureCandidates, ...familiarCandidates]),
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
      logExposures: vi.fn(async () => undefined),
      saveRecommendationRun: vi.fn(
        async (input: { items: Array<Record<string, unknown>>; metadata: Record<string, unknown>; [key: string]: unknown }) => {
          const items = input.items.map((item, index) => ({
            ...item,
            id: `item-${index}`,
            runId: "run-1",
            profileId: "default",
            createdAt: "2026-01-01T00:00:00.000Z"
          })) as unknown as RecommendationItem[];
          return {
            id: "run-1",
            profileId: "default",
            promptVersion: String(input.promptVersion),
            scoringVersion: String(input.scoringVersion),
            status: input.status,
            baselineAverage: null,
            recommendationAverage: null,
            metadata: input.metadata ?? {},
            createdAt: "2026-01-01T00:00:00.000Z",
            items
          } as RecommendationRun;
        }
      )
    } as unknown as MovieStore;

    const result = await generateRecommendations(store, "default", 10);
    expect(result.ready).toBe(true);
    expect(result.recommendations.length).toBe(10);

    const obscureCount = result.recommendations.filter((item) => item.movie.voteCount < 3000).length;
    expect(obscureCount).toBeLessThanOrEqual(2);
  });
});

describe("generateRecommendations genre filter", () => {
  const ACTION = { id: 28, name: "Action" };
  const DRAMA = { id: 18, name: "Drama" };

  function buildMockStore() {
    const ratedMovies = Array.from({ length: 10 }, (_, index) =>
      movie(200 + index, `Rated Movie ${index}`, [fact(200 + index, "tone", "tense")], [DRAMA])
    );
    const actionCandidates = Array.from({ length: 3 }, (_, index) =>
      movie(300 + index, `Action Candidate ${index}`, [fact(300 + index, "tone", "tense")], [ACTION])
    );
    const dramaCandidates = Array.from({ length: 3 }, (_, index) =>
      movie(400 + index, `Drama Candidate ${index}`, [fact(400 + index, "tone", "tense")], [DRAMA])
    );
    const ratings = ratedMovies.map((rated, index) => rating(rated.tmdbId, index < 4 ? "like" : "dislike"));

    const store = {
      listMovies: vi.fn(async () => [...ratedMovies, ...actionCandidates, ...dramaCandidates]),
      listRatings: vi.fn(async () => ratings),
      listRatingReasons: vi.fn(async () => []),
      listRatingTraitReasons: vi.fn(async () => []),
      listExposures: vi.fn(async () => []),
      listAppealSignals: vi.fn(async () => []),
      listWatchlist: vi.fn(async () => []),
      listHiddenRecommendations: vi.fn(async () => []),
      listComparisons: vi.fn(async () => []),
      listMovieEmbeddings: vi.fn(async () => []),
      matchMovieEmbeddings: vi.fn(async () => []),
      logExposure: vi.fn(async () => undefined),
      logExposures: vi.fn(async () => undefined),
      saveRecommendationRun: vi.fn(
        async (input: { items: Array<Record<string, unknown>>; metadata: Record<string, unknown>; [key: string]: unknown }) => {
          const items = input.items.map((item, index) => ({
            ...item,
            id: `item-${index}`,
            runId: "run-1",
            profileId: "default",
            createdAt: "2026-01-01T00:00:00.000Z"
          })) as unknown as RecommendationItem[];
          return {
            id: "run-1",
            profileId: "default",
            promptVersion: String(input.promptVersion),
            scoringVersion: String(input.scoringVersion),
            status: input.status,
            baselineAverage: null,
            recommendationAverage: null,
            metadata: input.metadata ?? {},
            createdAt: "2026-01-01T00:00:00.000Z",
            items
          } as RecommendationRun;
        }
      )
    };

    return store as unknown as MovieStore & typeof store;
  }

  it("only recommends movies in the requested genre and records the filter", async () => {
    const store = buildMockStore();
    const result = await generateRecommendations(store, "default", 10, { genreId: ACTION.id, genreName: ACTION.name });

    expect(result.ready).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const item of result.recommendations) {
      expect(item.movie.genres.map((genre) => genre.id)).toContain(ACTION.id);
    }

    const runInput = store.saveRecommendationRun.mock.calls[0][0];
    expect(runInput.metadata.genreFilter).toEqual({ id: ACTION.id, name: ACTION.name });
  });

  it("recommends across genres when no filter is given", async () => {
    const store = buildMockStore();
    const result = await generateRecommendations(store, "default", 10);

    expect(result.ready).toBe(true);
    const genreIds = new Set(result.recommendations.flatMap((item) => item.movie.genres.map((genre) => genre.id)));
    expect(genreIds.has(ACTION.id)).toBe(true);
    expect(genreIds.has(DRAMA.id)).toBe(true);

    const runInput = store.saveRecommendationRun.mock.calls[0][0];
    expect(runInput.metadata.genreFilter).toBeNull();
  });
});
