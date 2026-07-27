import { EMBEDDING_MODEL, embedMovies, embedTexts, embeddingConfigured } from "@/lib/embeddings";
import type { MovieStore } from "@/lib/store";
import { featureTextForMovie } from "@/lib/taste";
import { TAXONOMY_TRAITS, TAXONOMY_VERSION, taxonomyTextForEmbedding } from "@/lib/taxonomy";
import { alignTraitVectors, scoreMovieAgainstTaxonomy, type TraitVector } from "@/lib/taxonomyScoring";
import type { Movie, TaxonomyEmbedding } from "@/lib/types";

const EMBED_BATCH_SIZE = 64;

export interface IntelligenceResult {
  embedded: number;
  taxonomyScored: number;
  skipped: number;
  failed: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/**
 * Ensure the current taxonomy trait embeddings exist in the store, embedding + caching
 * them on first use (or whenever the taxonomy version changes). Returns aligned vectors.
 */
export async function ensureTaxonomyVectors(store: MovieStore): Promise<TraitVector[]> {
  const cached = await store.listTaxonomyEmbeddings(TAXONOMY_VERSION);
  const cachedById = new Map(cached.map((item) => [item.traitId, item.embedding]));
  const missing = TAXONOMY_TRAITS.filter((trait) => !cachedById.get(trait.id)?.length);

  if (missing.length) {
    const embeddings = await embedTexts(missing.map(taxonomyTextForEmbedding));
    if (embeddings) {
      const toSave: TaxonomyEmbedding[] = missing.map((trait, index) => ({
        traitId: trait.id,
        version: TAXONOMY_VERSION,
        embedding: embeddings[index]
      }));
      await store.saveTaxonomyEmbeddings(toSave);
      for (const item of toSave) cachedById.set(item.traitId, item.embedding);
    }
  }

  return alignTraitVectors(cachedById);
}

/**
 * Embed any movies missing/stale embeddings and (re)score their taxonomy facts.
 * Idempotent: skips movies whose stored featureText + model already match.
 * Safe to call at runtime (fire-and-forget) or from the sync script.
 */
export async function ensureMovieIntelligence(store: MovieStore, movies: Movie[]): Promise<IntelligenceResult> {
  const result: IntelligenceResult = { embedded: 0, taxonomyScored: 0, skipped: 0, failed: 0 };
  if (!movies.length || !embeddingConfigured()) {
    result.skipped = movies.length;
    return result;
  }

  const ids = movies.map((movie) => movie.tmdbId);
  const existing = new Map((await store.listMovieEmbeddings(ids)).map((embedding) => [embedding.tmdbId, embedding]));

  const stale = movies.filter((movie) => {
    const current = existing.get(movie.tmdbId);
    const featureText = featureTextForMovie(movie);
    return current?.model !== EMBEDDING_MODEL || current.featureText !== featureText || !current.embedding.length;
  });

  if (!stale.length) {
    result.skipped = movies.length;
    return result;
  }

  const traitVectors = await ensureTaxonomyVectors(store);

  for (const batch of chunk(stale, EMBED_BATCH_SIZE)) {
    try {
      const embeddings = await embedMovies(batch);
      if (!embeddings) throw new Error("Embeddings client not configured");

      for (const embedding of embeddings) {
        await store.upsertMovieEmbedding({
          tmdbId: embedding.tmdbId,
          model: embedding.model,
          featureText: embedding.featureText,
          embedding: embedding.embedding
        });
        result.embedded += 1;

        if (traitVectors.length) {
          const facts = scoreMovieAgainstTaxonomy(embedding.tmdbId, embedding.embedding, traitVectors);
          await store.replaceTasteFactsForMovie(embedding.tmdbId, "taxonomy", facts);
          result.taxonomyScored += 1;
        }
      }
    } catch (error) {
      result.failed += batch.length;
      console.warn("Movie intelligence batch failed", error instanceof Error ? error.message : error);
    }
  }

  result.skipped = movies.length - stale.length;
  return result;
}

/** Fire-and-forget runtime hook: enrich newly upserted movies without blocking the response. */
export function scheduleMovieIntelligence(store: MovieStore, movies: Movie[]): void {
  if (!movies.length || !embeddingConfigured()) return;
  void ensureMovieIntelligence(store, movies).catch((error) => {
    console.warn("Background movie intelligence failed", error instanceof Error ? error.message : error);
  });
}
