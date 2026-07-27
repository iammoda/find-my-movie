import { describe, expect, it } from "vitest";
import { cosineSimilarity, scoreMovieAgainstTaxonomy, taxonomyFactWeight, type TraitVector } from "@/lib/taxonomyScoring";
import { TAXONOMY_TRAITS } from "@/lib/taxonomy";

function traitVector(id: string, embedding: number[]): TraitVector {
  const trait = TAXONOMY_TRAITS.find((item) => item.id === id)!;
  return { trait, embedding };
}

describe("cosineSimilarity", () => {
  it("is 1 for identical directions and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("is 0 when either vector is empty or zero", () => {
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("taxonomyFactWeight", () => {
  it("clamps into [0.35, 1.25] and scales by base weight", () => {
    expect(taxonomyFactWeight(0.4, 1)).toBeCloseTo(0.55, 4);
    expect(taxonomyFactWeight(0.9, 1.15)).toBeLessThanOrEqual(1.25);
    expect(taxonomyFactWeight(0.1, 1)).toBeGreaterThanOrEqual(0.35);
  });
});

describe("scoreMovieAgainstTaxonomy", () => {
  const traitVectors = [
    traitVector("moral_compromise", [1, 0, 0, 0]),
    traitVector("systems_corruption", [0.95, 0.1, 0, 0]),
    traitVector("feel_good_momentum", [0, 1, 0, 0])
  ];

  it("keeps the closest traits above the similarity floor", () => {
    const facts = scoreMovieAgainstTaxonomy(42, [1, 0, 0, 0], traitVectors);
    const ids = facts.map((fact) => fact.value);
    expect(ids).toContain("moral_compromise");
    expect(ids).toContain("systems_corruption");
    expect(ids).not.toContain("feel_good_momentum");
    expect(facts.every((fact) => fact.source === "taxonomy")).toBe(true);
    expect(facts.every((fact) => fact.tmdbId === 42)).toBe(true);
  });

  it("returns nothing when nothing clears the minimum similarity", () => {
    expect(scoreMovieAgainstTaxonomy(1, [0, 0, 1, 0], traitVectors)).toEqual([]);
  });

  it("returns nothing without an embedding or trait vectors", () => {
    expect(scoreMovieAgainstTaxonomy(1, [], traitVectors)).toEqual([]);
    expect(scoreMovieAgainstTaxonomy(1, [1, 0, 0, 0], [])).toEqual([]);
  });

  it("caps at five traits per movie", () => {
    const many = TAXONOMY_TRAITS.slice(0, 10).map((trait) => ({ trait, embedding: [1, 0, 0, 0] }));
    const facts = scoreMovieAgainstTaxonomy(1, [1, 0, 0, 0], many);
    expect(facts.length).toBeLessThanOrEqual(5);
  });
});
