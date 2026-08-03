import type { MovieStore } from "@/lib/store";

/**
 * Process-wide cache for movie embeddings (immutable per movie). Shared by the
 * deck (browse) and recommendation generation so replans and rec runs only
 * fetch vectors for movies not seen before. Movies known to lack an embedding
 * are stored as empty arrays so they are not re-queried on every request.
 * Eviction is oldest-first (Map insertion order), never a wholesale clear.
 */
const embeddingCache = new Map<number, number[]>();
const EMBEDDING_CACHE_MAX = 6000;

function evictOverflow(incoming: number) {
  const overflow = embeddingCache.size + incoming - EMBEDDING_CACHE_MAX;
  if (overflow <= 0) return;
  const iterator = embeddingCache.keys();
  for (let index = 0; index < overflow; index += 1) {
    const oldest = iterator.next();
    if (oldest.done) break;
    embeddingCache.delete(oldest.value);
  }
}

/** Embeddings for the given movies; only movies with a non-empty vector appear in the result. */
export async function cachedMovieEmbeddings(
  store: Pick<MovieStore, "listMovieEmbeddings">,
  tmdbIds: number[]
): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  const missing: number[] = [];
  for (const tmdbId of tmdbIds) {
    const cached = embeddingCache.get(tmdbId);
    if (cached === undefined) missing.push(tmdbId);
    else if (cached.length) result.set(tmdbId, cached);
  }

  if (missing.length) {
    const fetched = await store.listMovieEmbeddings(missing);
    evictOverflow(missing.length);
    const fetchedIds = new Set<number>();
    for (const embedding of fetched) {
      fetchedIds.add(embedding.tmdbId);
      embeddingCache.set(embedding.tmdbId, embedding.embedding);
      if (embedding.embedding.length) result.set(embedding.tmdbId, embedding.embedding);
    }
    for (const tmdbId of missing) {
      if (!fetchedIds.has(tmdbId)) embeddingCache.set(tmdbId, []);
    }
  }

  return result;
}
