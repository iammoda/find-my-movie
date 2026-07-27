import { TAXONOMY_TRAITS, type TaxonomyTrait } from "@/lib/taxonomy";
import type { TasteFact } from "@/lib/types";

/**
 * Content-based taxonomy scoring: cosine-match a movie embedding against the 90 trait
 * embeddings and keep the closest few as `source: "taxonomy"` facts. Shared by the
 * offline script, the sync command, and the runtime auto-intelligence hook.
 */

export const MIN_TAXONOMY_SIMILARITY = 0.4;
export const MAX_TRAITS_PER_MOVIE = 5;
export const MAX_MARGIN_FROM_BEST = 0.055;

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }
  if (!aMagnitude || !bMagnitude) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

export function taxonomyFactWeight(similarity: number, baseWeight: number): number {
  return Number(Math.min(1.25, Math.max(0.35, (similarity - MIN_TAXONOMY_SIMILARITY) * 4 + 0.55) * baseWeight).toFixed(4));
}

export interface TraitVector {
  trait: TaxonomyTrait;
  embedding: number[];
}

/**
 * Score a single movie embedding against the trait vectors, returning taxonomy facts.
 * `traitVectors` must be aligned to real trait definitions (order-independent).
 */
export function scoreMovieAgainstTaxonomy(tmdbId: number, movieEmbedding: number[], traitVectors: TraitVector[]): TasteFact[] {
  if (!movieEmbedding.length || !traitVectors.length) return [];

  const ranked = traitVectors
    .map(({ trait, embedding }) => ({ trait, similarity: cosineSimilarity(movieEmbedding, embedding) }))
    .sort((a, b) => b.similarity - a.similarity);

  const bestSimilarity = ranked[0]?.similarity ?? 0;
  const cutoff = Math.max(MIN_TAXONOMY_SIMILARITY, bestSimilarity - MAX_MARGIN_FROM_BEST);

  return ranked
    .filter((item) => item.similarity >= cutoff)
    .slice(0, MAX_TRAITS_PER_MOVIE)
    .map((item) => ({
      tmdbId,
      kind: item.trait.facet,
      value: item.trait.id,
      weight: taxonomyFactWeight(item.similarity, item.trait.weight),
      source: "taxonomy" as const
    }));
}

/** Pair stored taxonomy embeddings back to their trait definitions. Skips unknown/empty ids. */
export function alignTraitVectors(embeddingsByTraitId: Map<string, number[]>): TraitVector[] {
  const vectors: TraitVector[] = [];
  for (const trait of TAXONOMY_TRAITS) {
    const embedding = embeddingsByTraitId.get(trait.id);
    if (embedding?.length) vectors.push({ trait, embedding });
  }
  return vectors;
}
