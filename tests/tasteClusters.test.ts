import { describe, expect, it } from "vitest";
import { buildTasteClusters, type LovedMovieSample } from "@/lib/tasteClusters";
import type { Movie } from "@/lib/types";

function movie(tmdbId: number, title: string, genres: Array<{ id: number; name: string }>): Movie {
  return {
    tmdbId,
    title,
    overview: `${title} overview.`,
    posterPath: "/poster.jpg",
    releaseDate: "2012-01-01",
    runtime: 110,
    voteAverage: 7.8,
    voteCount: 8000,
    popularity: 60,
    adult: false,
    genres,
    keywords: [],
    countries: [],
    credits: { tmdbId, director: null, actors: [] },
    tasteFacts: []
  };
}

function sample(tmdbId: number, title: string, embedding: number[], rankScore: number, genreName = "Drama"): LovedMovieSample {
  return {
    movie: movie(tmdbId, title, [{ id: 1, name: genreName }]),
    rankScore,
    embedding
  };
}

describe("taste clusters", () => {
  it("returns nothing when there are too few loved movies", () => {
    const samples = [sample(1, "A", [1, 0], 9), sample(2, "B", [0, 1], 8)];
    expect(buildTasteClusters(samples)).toEqual([]);
  });

  it("separates two obvious embedding groups and names exemplars by rank", () => {
    const crime = Array.from({ length: 6 }, (_, i) =>
      sample(100 + i, `Crime ${i}`, [1, 0.05 * i, 0, 0], 9.5 - i * 0.2, "Crime")
    );
    const animation = Array.from({ length: 6 }, (_, i) =>
      sample(200 + i, `Animation ${i}`, [0, 0, 1, 0.05 * i], 9.4 - i * 0.2, "Animation")
    );

    const clusters = buildTasteClusters([...crime, ...animation], 4);

    expect(clusters.length).toBe(2);
    for (const cluster of clusters) {
      expect(cluster.size).toBe(6);
      expect(cluster.exemplars.length).toBe(3);
      expect(cluster.label.length).toBeGreaterThan(0);
      expect(cluster.genres.length).toBeGreaterThan(0);
    }
    // Theme/genre context is exposed directly (the UI shows genres, not titles).
    const genreSets = clusters.map((cluster) => cluster.genres.join(" "));
    expect(genreSets.some((genres) => genres.includes("Crime"))).toBe(true);
    expect(genreSets.some((genres) => genres.includes("Animation"))).toBe(true);
    const exemplarSets = clusters.map((cluster) => cluster.exemplars.join(" ")); 
    const crimeCluster = exemplarSets.find((titles) => titles.includes("Crime"));
    const animationCluster = exemplarSets.find((titles) => titles.includes("Animation"));
    expect(crimeCluster).toBeDefined();
    expect(animationCluster).toBeDefined();
    // No cross-contamination between the groups.
    expect(crimeCluster).not.toContain("Animation");
    expect(animationCluster).not.toContain("Crime");
    // Exemplars are the highest-ranked members first.
    expect(crimeCluster?.startsWith("Crime 0")).toBe(true);
  });

  it("skips movies without embeddings", () => {
    const withEmbeddings = Array.from({ length: 8 }, (_, i) => sample(1 + i, `Movie ${i}`, [1, 0.01 * i], 9 - i * 0.1));
    const withoutEmbedding = sample(99, "No Vector", [], 10);

    const clusters = buildTasteClusters([...withEmbeddings, withoutEmbedding], 3);
    for (const cluster of clusters) {
      expect(cluster.exemplars).not.toContain("No Vector");
    }
  });
});
