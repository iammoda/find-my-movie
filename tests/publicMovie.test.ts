import { describe, expect, it } from "vitest";
import { publicMovie } from "@/lib/publicMovie";
import type { Movie } from "@/lib/types";

function movie(): Movie {
  return {
    tmdbId: 1,
    title: "Trait Movie",
    overview: "A movie with taxonomy traits.",
    posterPath: "/poster.jpg",
    releaseDate: "2010-01-01",
    runtime: 100,
    voteAverage: 7.5,
    voteCount: 1000,
    popularity: 30,
    adult: false,
    genres: [],
    keywords: [],
    countries: [],
    tasteFacts: [
      { tmdbId: 1, kind: "pacing", value: "propulsive_momentum", weight: 1.2, source: "taxonomy" },
      { tmdbId: 1, kind: "structure", value: "visceral_action_craft", weight: 1.1, source: "taxonomy" },
      { tmdbId: 1, kind: "theme", value: "moral_compromise", weight: 0.9, source: "taxonomy" },
      { tmdbId: 1, kind: "genre", value: "Action", weight: 0.6, source: "tmdb" }
    ]
  };
}

describe("public movie payload", () => {
  it("exposes lightweight taxonomy trait suggestions without full taste facts", () => {
    const result = publicMovie(movie());

    expect(result.tasteFacts).toBeUndefined();
    expect(result.tasteTraits?.map((trait) => trait.id)).toEqual(["visceral_action_craft", "moral_compromise"]);
    expect(result.tasteTraits?.[0]).toMatchObject({
      label: "visceral action craft",
      kind: "structure"
    });
  });

  it("does not expose horror-only prompt traits for non-horror movies", () => {
    const result = publicMovie({
      ...movie(),
      genres: [{ id: 16, name: "Animation" }],
      tasteFacts: [
        { tmdbId: 1, kind: "theme", value: "monster_as_metaphor", weight: 1.1, source: "taxonomy" },
        { tmdbId: 1, kind: "theme", value: "family_legacy", weight: 1, source: "taxonomy" }
      ]
    });

    expect(result.tasteTraits?.map((trait) => trait.id)).toEqual(["family_legacy"]);
  });
});
